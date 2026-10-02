import os
from pathlib import Path

from vakya_companion.engine import Engine, ProviderError, SemanticReply, require_sanskrit

MODEL_ID = "Qwen/Qwen3-4B"
REVISION = "1cfa9a7208912126459214e8b04321603b3df60c"
TRANSLATION_ID = "google/madlad400-3b-mt"
TRANSLATION_REVISION = "fa184c675da0b5c9e1c8694fccd4e12e2d422094"


def has_weights(path):
    return (path / "config.json").is_file() and any(path.glob("*.safetensors"))


class HostedEngine(Engine):
    def __init__(self):
        self.path = Path(os.environ.get("VAKYA_QWEN_PATH", "/opt/models/qwen"))
        self.translation_path = Path(os.environ.get("VAKYA_TRANSLATION_PATH", "/opt/models/madlad"))
        self.provider = os.environ.get("VAKYA_TRANSLATION_PROVIDER", "madlad")
        if self.provider not in ("madlad", "indictrans2"):
            raise ValueError("VAKYA_TRANSLATION_PROVIDER must be madlad or indictrans2.")
        self.model = self.tokenizer = None
        self.translation_model = self.translation_tokenizer = None

    def capabilities(self):
        result = super().capabilities()
        if self.provider == "madlad":
            result["translation"] = dict.fromkeys(result["translation"], has_weights(self.translation_path))
        result.update(
            conversation=has_weights(self.path) and all(result["translation"].values()),
            speech=bool(os.environ.get("VAKYA_TTS_API_URL")), deployment="hosted",
            translationProvider=self.provider, conversationProvider=MODEL_ID, experimental=True,
        )
        return result

    def translate(self, text, source, target):
        if source == target or self.provider == "indictrans2":
            return super().translate(text, source, target)
        if not has_weights(self.translation_path):
            raise ProviderError("provider_unavailable", "The selected translation provider is not provisioned.")
        import torch
        from transformers import T5ForConditionalGeneration, T5Tokenizer

        if not torch.cuda.is_available():
            raise ProviderError("provider_unavailable", "GPU translation is not available.")
        if self.translation_model is None:
            tokenizer = T5Tokenizer.from_pretrained(self.translation_path, local_files_only=True)
            model = T5ForConditionalGeneration.from_pretrained(
                self.translation_path, local_files_only=True, use_safetensors=True,
                torch_dtype=torch.float32, low_cpu_mem_usage=True,
            ).eval()
            self.translation_model, self.translation_tokenizer = model, tokenizer
        model, tokenizer = self.translation_model, self.translation_tokenizer
        inputs = generated = None
        try:
            model.to("cuda")
            inputs = tokenizer(f"<2{target}> {text}", return_tensors="pt").to("cuda")
            if inputs.input_ids.shape[1] > 512:
                raise ProviderError("invalid_request", "Use a shorter sentence.")
            with torch.inference_mode():
                generated = model.generate(**inputs, max_new_tokens=256, max_time=90, do_sample=False)
            if tokenizer.eos_token_id not in generated[0][1:].tolist():
                raise ProviderError("invalid_output", "Translation did not finish within its limits.")
            output = tokenizer.decode(generated[0], skip_special_tokens=True).strip()
            if not output or len(output) > 1600:
                raise ProviderError("invalid_output", "The translation result was empty or too long.")
            return require_sanskrit(output) if target == "sa" else output
        finally:
            del inputs, generated
            model.to("cpu")
            torch.cuda.empty_cache()

    def semantic_reply(self, text, level, history):
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer

        if not has_weights(self.path) or not torch.cuda.is_available():
            raise ProviderError("provider_unavailable", "GPU conversation is not available.")
        if self.model is None:
            tokenizer = AutoTokenizer.from_pretrained(self.path, local_files_only=True)
            model = AutoModelForCausalLM.from_pretrained(
                self.path, local_files_only=True, use_safetensors=True, low_cpu_mem_usage=True,
                torch_dtype=torch.float16, attn_implementation="eager",
            ).eval()
            self.tokenizer, self.model = tokenizer, model
        messages = [{
            "role": "system",
            "content": (
                "You are an English-speaking conversation planner for a Sanskrit learning app. "
                "Write both JSON values in English only. A separate translation model translates them. "
                "Do not invent vocabulary, translations, grammar rules, or language examples. "
                "Only greet, ask everyday conversational questions, or offer general practice encouragement. "
                f"The learner is {level}. Keep each field to one short sentence. "
                'Return only JSON with exactly two strings: {"reply":"your conversational reply",'
                '"explanation":"a brief learning tip"}. No markdown or thinking text.'
            ),
        }, *history, {"role": "user", "content": text}]
        formatted = self.tokenizer.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=True, enable_thinking=False,
        )
        inputs = output = tokens = None
        try:
            self.model.to("cuda")
            inputs = self.tokenizer(formatted, return_tensors="pt").to("cuda")
            if inputs.input_ids.shape[1] > 2048:
                raise ProviderError("invalid_request", "Clear the conversation and use a shorter sentence.")
            with torch.inference_mode():
                output = self.model.generate(
                    **inputs, max_new_tokens=256, max_time=60, do_sample=True,
                    temperature=0.7, top_p=0.8, top_k=20, repetition_penalty=1.1,
                    pad_token_id=self.tokenizer.eos_token_id,
                )
            tokens = output[0, inputs.input_ids.shape[1]:]
            if self.tokenizer.eos_token_id not in tokens.tolist():
                raise ProviderError("invalid_output", "Conversation generation did not finish.")
            decoded = self.tokenizer.decode(tokens, skip_special_tokens=True).strip()
            try:
                return SemanticReply.model_validate_json(decoded)
            except ValueError as error:
                raise ProviderError("invalid_output", "The conversation model returned invalid JSON.") from error
        finally:
            del inputs, output, tokens
            self.model.to("cpu")
            torch.cuda.empty_cache()

    def teach(self, text, source):
        result = super().teach(text, source)
        if source != "sa":
            result["provider"] = TRANSLATION_ID if self.provider == "madlad" else "IndicTrans2"
        return result

    def converse(self, text, source, support, level, history):
        result = super().converse(text, source, support, level, history)
        result["provider"] = f"{MODEL_ID}+{self.provider}"
        return result

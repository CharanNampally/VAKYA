import gc
import importlib.util
import json
import logging
import os
import re
import unicodedata
from typing import Literal

from indic_transliteration import sanscript
from pydantic import BaseModel, ConfigDict, Field

from .models import MODELS, installed

Language = Literal["en", "hi", "te", "sa"]
CODES = {"en": "eng_Latn", "hi": "hin_Deva", "te": "tel_Telu", "sa": "san_Deva"}


class ProviderError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


class SemanticReply(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    reply: str = Field(min_length=1, max_length=400)
    explanation: str = Field(min_length=1, max_length=400)


def direction(source: Language, target: Language) -> str:
    if source == target:
        return "identity"
    if source == "en":
        return "en-indic"
    return "indic-en" if target == "en" else "indic-indic"


def iast(text: str) -> str:
    return sanscript.transliterate(text, sanscript.DEVANAGARI, sanscript.IAST)


def require_sanskrit(text: str) -> str:
    text = unicodedata.normalize("NFC", text.strip())
    if not re.search(r"[\u0900-\u097f]", text):
        raise ProviderError("invalid_output", "Expected Sanskrit in Devanagari.")
    return text


class Engine:
    def capabilities(self) -> dict:
        translation = {key: installed(key) for key in ("en-indic", "indic-en", "indic-indic")}
        return {
            "protocol": 1,
            "translation": translation,
            "analysis": importlib.util.find_spec("sanskrit_parser") is not None,
            "conversation": installed("qwen") and all(translation.values())
                and os.environ.get("VAKYA_EXPERIMENTAL_CONVERSATION") == "1",
            "speech": False,
            "sources": list(CODES),
        }

    def translate(self, text: str, source: Language, target: Language) -> str:
        name = direction(source, target)
        if name == "identity":
            return unicodedata.normalize("NFC", text)
        if not installed(name):
            raise ProviderError("provider_unavailable", f"Provision the {name} translation provider.")
        import torch
        from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
        from IndicTransToolkit.processor import IndicProcessor

        torch.set_num_threads(2)
        path = str(MODELS[name].path(name))
        tokenizer = AutoTokenizer.from_pretrained(path, trust_remote_code=True, local_files_only=True)
        model = AutoModelForSeq2SeqLM.from_pretrained(
            path, trust_remote_code=True, local_files_only=True,
            use_safetensors=True, attn_implementation="eager",
        ).eval()
        try:
            processor = IndicProcessor(inference=True)
            batch = processor.preprocess_batch([text], src_lang=CODES[source], tgt_lang=CODES[target])
            inputs = tokenizer(batch, return_tensors="pt", padding=True, truncation=False)
            if inputs.input_ids.shape[1] > 512:
                raise ProviderError("invalid_request", "Use a shorter sentence.")
            with torch.inference_mode():
                generated = model.generate(
                    **inputs, num_beams=1, do_sample=False, max_new_tokens=256, max_time=90,
                )
            if tokenizer.eos_token_id not in generated[0][1:].tolist():
                raise ProviderError("invalid_output", "Translation did not finish within its limits.")
            decoded = tokenizer.batch_decode(generated, skip_special_tokens=True)
            output = processor.postprocess_batch(decoded, lang=CODES[target])[0].strip()
            if not output or len(output) > 1600:
                raise ProviderError("invalid_output", "Translation returned invalid text.")
            return require_sanskrit(output) if target == "sa" else output
        finally:
            del model, tokenizer
            gc.collect()

    def teach(self, text: str, source: Language) -> dict:
        output = require_sanskrit(self.translate(text, source, "sa"))
        return {
            "sanskrit": output, "transliteration": iast(output),
            "provider": direction(source, "sa"),
            "warnings": ["transliteration_only" if source == "sa" else "machine_translation"],
        }

    def analyze(self, text: str) -> dict:
        if importlib.util.find_spec("sanskrit_parser") is None:
            raise ProviderError("provider_unavailable", "Install the grammar extra.")
        from sanskrit_parser.base.sanskrit_base import SanskritObject
        from sanskrit_parser.parser.sandhi_analyzer import LexicalSandhiAnalyzer

        require_sanskrit(text)
        # Upstream debug logs can contain learner text; keep that logger disabled.
        logging.getLogger("sanskrit_parser").setLevel(logging.CRITICAL)
        analyzer = LexicalSandhiAnalyzer("inria")
        words = []
        for word in re.findall(r"[\u0900-\u0963\u0970-\u097f]+", text)[:24]:
            candidates = {}
            for ending in ("s", "r"):
                value = SanskritObject(word, encoding=sanscript.DEVANAGARI, strict_io=False, replace_ending_visarga=ending)
                for root, tags in analyzer.getMorphologicalTags(value) or []:
                    root_text = str(root)
                    tag_list = sorted(str(tag) for tag in tags)
                    candidates[(root_text, tuple(tag_list))] = {"root": root_text, "tags": tag_list}
            words.append({"word": word, "candidates": list(candidates.values())[:12]})
        return {"words": words, "provider": "sanskrit_parser/inria", "warnings": ["candidate_analysis"]}

    def semantic_reply(self, text: str, level: str, history: list[dict]) -> SemanticReply:
        if not installed("qwen"):
            raise ProviderError("provider_unavailable", "Provision the local Qwen provider.")
        import mlx.core as mx
        from mlx_lm import generate, load
        from mlx_lm.sample_utils import make_logits_processors, make_sampler

        model, tokenizer = load(str(MODELS["qwen"].path("qwen")))
        try:
            messages = [{
                "role": "system",
                "content": (
                    "You are an English-speaking conversation planner for a Sanskrit learning app. "
                    "Write both JSON values in English only. Do not translate or transliterate into Sanskrit; "
                    "a separate translation component does that after you reply. "
                    "Do not invent vocabulary, translations, grammar rules, or language examples. "
                    "Only greet, ask everyday conversational questions, or offer general practice encouragement. "
                    f"The learner is {level}. Keep each field to one short sentence. "
                    'Return only JSON with exactly two strings: {"reply":"your conversational reply",'
                    '"explanation":"a brief learning tip"}. Do not claim to verify grammar. '
                    "No markdown, tool calls, or thinking text."
                ),
            }, *history, {"role": "user", "content": text}]
            prompt = tokenizer.apply_chat_template(
                messages, tokenize=False, add_generation_prompt=True, enable_thinking=False,
            )
            output = generate(
                model, tokenizer, prompt=prompt, max_tokens=256,
                sampler=make_sampler(temp=0.7, top_p=0.8, top_k=20),
                logits_processors=make_logits_processors(repetition_penalty=1.1, repetition_context_size=64),
                verbose=False,
            )
            try:
                return SemanticReply.model_validate_json(output.strip())
            except ValueError as error:
                raise ProviderError("invalid_output", "The local conversation model returned invalid JSON.") from error
        finally:
            del model, tokenizer
            gc.collect()
            mx.clear_cache()

    def converse(self, text: str, source: Language, support: Language, level: str, history: list[dict]) -> dict:
        if not self.capabilities()["conversation"]:
            raise ProviderError("provider_unavailable", "Provision translation and Qwen, then explicitly enable experimental conversation.")
        english = self.translate(text, source, "en")
        semantic = self.semantic_reply(english, level, history)
        output = require_sanskrit(self.translate(semantic.reply, "en", "sa"))
        explanation = self.translate(semantic.explanation, "en", support)
        return {
            "sanskrit": output, "transliteration": iast(output), "support": explanation,
            "provider": "qwen3-4b+indictrans2", "warnings": ["machine_translation", "experimental_conversation"],
            "history": [*history, {"role": "user", "content": english},
                        {"role": "assistant", "content": semantic.reply}][-6:],
        }

    def speak(self, text: str) -> bytes:
        raise ProviderError("provider_unavailable", "Sanskrit TTS requires its separate compatible runtime.")

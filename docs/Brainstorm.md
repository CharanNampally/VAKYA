# Vākya brainstorm — technical assessment

## Engineering assessment — 2 October 2026

The original brainstorming material is preserved below. It is a proposal, **not a record of implemented or validated capabilities**. The implementation authority is the [local companion architecture](./LOCAL-COMPANION-ARCHITECTURE.md).

**Subsequent hosting clarification:** the owner wants the public client backed by a hosted model service, with no Python installation or local pairing for learners. The local companion below is retained as a development/offline option. See the architecture's hosting-direction update for the distinction between the currently implemented TTS container and the still-needed hosted translation/conversation API.

**Current model decision:** keep translation providers interchangeable. IndicTrans2
remains supported but its three checkpoints are still access-gated. Evaluate
ungated Apache-2.0 MADLAD-400-3B-MT as the hosted default; reserve Qwen for English
conversation planning. Vāgbodhinī is the chant-tutor app built on Vāgdhenu, not
another speech model. Vaani's DhVaani and SraVaani are distinct TTS/ASR candidates.
See the [hosted provider design](./LOCAL-COMPANION-ARCHITECTURE.md#hosted-provider-selection-and-deployment-design).

### Decisions confirmed with the product owner

- Keep the Expo web/iOS/Android codebase; do not replace it with Next.js.
- Keep GitHub Pages as a static frontend.
- Run additional models in a **local Python companion service**, not inside GitHub Pages.
- Keep the account-free product and local preferences. PostgreSQL, cloud recording storage, and user accounts are not requirements.
- Begin with English, Hindi, Telugu, and Sanskrit as explicit input-language choices; support-language localization remains English/Hindi/Telugu.
- The owner will approve gated model terms and configure Hugging Face access locally so real models can be downloaded and evaluated. Credentials must never enter the app bundle, repository, URL, or telemetry.

### Corrections to the proposal

| Claim in the brainstorm | Engineering conclusion |
| --- | --- |
| Su-shrota can speak the answer | No. It is ASR only. Existing browser inference recognizes Sanskrit; it is not Telugu/English ASR or TTS. |
| Removing the conversational LLM makes translation deterministic and hallucination-free | Fixed decoding can be repeatable. Neural translation can still omit words, change meaning, or invent content. Teach mode must say “machine translation,” not “verified Sanskrit.” |
| A parser is a Sanskrit correctness engine | It provides candidate analyses. Upstream explicitly warns about over-generation and under-generation. No parse is not proof of an error; a parse is not proof of grammatical or semantic correctness. |
| English JSON is a language-neutral meaning representation | It is a bounded English-pivot contract. Translation can lose gender, number, politeness, tense, and ambiguity. Preserve original input and test pivot loss. |
| One IndicTrans2 model handles English and all Indic directions | Three directional checkpoints are needed: English→Indic 200M, Indic→English 200M, Indic→Indic 320M. |
| MIT/Apache metadata means unrestricted anonymous downloads | The four proposed translation/TTS checkpoints currently report `gated: auto`; direct unauthenticated README requests returned HTTP 401 during assessment. Obtain access normally; do not bypass gates. |
| The entire model stack can stay resident on a small laptop | Not established. The available development machine has 16 GiB unified memory. Load models lazily, serialize inference, and release stage resources rather than load every model at startup. |
| Sanskrit TTS is already solved by a browser voice | No verified Sanskrit browser voice was found in the earlier ASR investigation. Indic Parler lists Sanskrit in its metadata, but pronunciation and latency require real listening tests. Never relabel a Hindi voice as Sanskrit. |
| EdgeSanskrit is entirely local, including its translation | Its README describes an OpenRouter/cloud-LLM fallback chain for English translation. Its phonetic/latency claims are unverified here. It is a benchmark candidate, not an automatic fallback. |
| Pronunciation can be graded from an ASR match | A recognition match is not a pronunciation grade. Acoustic/phonetic alignment and expert-calibrated thresholds are a separate project. |
| Language identification is essential before the first usable feature | Explicit source selection is more reliable for short, mixed-language learner utterances. Automatic LID can follow measured evaluation. |

### Verified evidence

- [IndicTrans2 source](https://github.com/AI4Bharat/IndicTrans2) lists `san_Deva`, `tel_Telu`, `hin_Deva`, and `eng_Latn` and requires its preprocessing/postprocessing pipeline.
- [IndicTrans2 English→Indic metadata](https://huggingface.co/api/models/ai4bharat/indictrans2-en-indic-dist-200M): MIT, custom model code, gated access.
- [IndicTrans2 Indic→Indic metadata](https://huggingface.co/api/models/ai4bharat/indictrans2-indic-indic-dist-320M): 320,861,184 FP32 parameters; approximately 1.28 GB for weights alone, not working RAM.
- [Indic Parler metadata](https://huggingface.co/api/models/ai4bharat/indic-parler-tts): Sanskrit and Telugu advertised; Apache-2.0; gated; 937,803,241 FP32 parameters, approximately 3.75 GB of weights.
- [sanskrit_parser README](https://github.com/kmadathil/sanskrit_parser): explicitly warns about invalid/missing forms and splits; Python compatibility and lexical-data licensing need separate attention.
- [Qwen3-4B card](https://huggingface.co/Qwen/Qwen3-4B): 4B, Apache-2.0, supports non-thinking generation; advertised multilingual coverage is not Sanskrit teaching evaluation.
- [EdgeSanskrit source](https://github.com/Hariprajwal/EdgeSanskrit-TTS): uses an IndicF5-derived stack and documents remote translation.

### Implementation order and acceptance

1. Document contracts, runtime boundaries, privacy, model provenance, and evaluation gates **before code changes**.
2. Build the loopback-only companion, explicit pairing, capability reporting, and bounded requests. No downloads or cloud fallback during an inference request.
3. Add text-first Teach mode, IAST, candidate morphology, and local conversation orchestration; connect the web UI without regressing existing lessons, language URLs, or browser ASR.
4. Provision approved translation models, run real translation cases, and measure latency/output rather than substitute a fixture response.
5. Activate Sanskrit TTS and the conversational SLM only after compatible runtime/model installation. A missing provider remains explicitly unavailable.
6. Add multilingual microphone ASR/LID and pronunciation scoring as separate, benchmarked increments. Existing Sanskrit browser ASR is reused now.

The architecture defines the target beyond the first increment. Completion notes must distinguish **implemented**, **tested with actual models**, **tested only with fixtures**, and **not yet activated**. A successful health endpoint or mocked test is not proof that a model works.

### First implementation outcome

The local companion, explicit pairing, localized Local Tutor screen, Sanskrit→IAST, and local word-candidate analysis are implemented and tested end-to-end. The existing ASR and lesson flows still pass their regression tests.

The ungated MLX Qwen3-4B checkpoint was downloaded and ran offline. Valid JSON was not sufficient: a real trial misidentified the Hindi word “Kaise” as Sanskrit. The planner prompt was narrowed, and local conversation is now explicitly experimental/off by default. The final three planner smoke tests returned English JSON in approximately 3–6.5 seconds; they do not prove Sanskrit teaching quality.

Hugging Face login succeeded, but the en→Indic weight request was still denied. The owner then selected **continue with available providers and record the blocker**. Translation activation and Sanskrit TTS remain incomplete; no cloud fallback or fabricated translation was introduced. Parler additionally requires an isolated runtime because its Transformers pin conflicts with the current environment.

See [implementation evidence and next release gates](./LOCAL-COMPANION-ARCHITECTURE.md#13-implementation-evidence) and [local setup](../companion/README.md). Multilingual ASR/LID, full sandhi disambiguation, adaptive teaching, and pronunciation scoring remain later stages, not delivered features.

---

## Original brainstorm (preserved)

Yes. With **Su-śrotā as your Sanskrit ASR**, you can build almost the entire first version locally. The key is **not to use one giant LLM for everything**. Use specialized small models/tools for translation, Sanskrit analysis, and a small multilingual SLM for conversation.

## The local stack I'd shortlist

| Layer                             | Open-source option                      |   Size | Role in your app                            |
| --------------------------------- | --------------------------------------- | -----: | ------------------------------------------- |
| **Sanskrit ASR**                  | **Su-śrotā / IndicConformer**           |  ~129M | Sanskrit speech → Sanskrit text             |
| **Translation**                   | **IndicTrans2 Indic-Indic Distilled**   |  ~320M | Sanskrit ↔ Telugu/Hindi/etc.                |
| **Translation**                   | **IndicTrans2 Indic-English Distilled** |  ~200M | Sanskrit ↔ English                          |
| **Translation, higher quality**   | **IndicTrans2 1B**                      |    ~1B | Better translation when hardware allows     |
| **Sanskrit morphology / grammar** | `sanskrit_parser`                       |      — | Sandhi, morphology, grammatical analysis    |
| **Sanskrit linguistic engine**    | Sanskrit Heritage / `heritage.py`       |      — | Morphology, sandhi, declension, conjugation |
| **General SLM**                   | Qwen / Gemma / similar 3–4B class       |   3–4B | Conversation reasoning/generation           |
| **General multilingual SLM**      | Aya / Qwen multilingual variants        |  ~3–8B | Multilingual conversation                   |
| **Speech synthesis**              | Indic/local TTS model                   | varies | Sanskrit text → speech                      |

The standout piece is **IndicTrans2**. It explicitly supports Sanskrit (`san_Deva`) alongside Telugu, English and the other Indic languages, and its model checkpoints are MIT-licensed. ([GitHub][1])

---

# 1. Your architecture should actually look like this

I would **not** make the SLM responsible for translation.

Instead:

```text
                  USER
                    │
                    ▼
              Microphone
                    │
                    ▼
              SU-SROTĀ ASR
                    │
                    ▼
             Sanskrit text
                    │
          ┌─────────┴─────────┐
          │                   │
          ▼                   ▼
   Sanskrit NLP          Translation
   / Grammar             IndicTrans2
          │                   │
          └─────────┬─────────┘
                    ▼
                 SLM
                    │
                    ▼
            Response meaning
                    │
                    ▼
              IndicTrans2
                    │
                    ▼
              Sanskrit text
                    │
                    ▼
                TTS
                    │
                    ▼
               SPEAKER
```

But **Teach Mode** should be even simpler.

---

# 2. Conversing mode

Imagine the learner says:

> "నాకు ఆకలిగా ఉంది. నాకు ఏమి తినాలి?"

The user doesn't need to know what's happening.

Internally:

```text
Telugu speech
     │
     ▼
ASR
     │
     ▼
Telugu text
     │
     ▼
IndicTrans2
Telugu → Sanskrit
     │
     ▼
Sanskrit meaning
     │
     ▼
Sanskrit SLM
     │
     ▼
Sanskrit response
     │
     ▼
Su-śrotā / TTS
     │
     ▼
User hears Sanskrit
```

But there's an important optimization:

### Don't translate to Sanskrit before the SLM unless necessary.

For conversation, I'd actually do:

```text
User speech
   ↓
ASR
   ↓
Telugu
   ↓
IndicTrans2
   ↓
English semantic representation
   ↓
SLM
   ↓
English semantic response
   ↓
IndicTrans2
   ↓
Sanskrit
   ↓
TTS
```

This gives the SLM a language it is much more likely to understand.

However, for **Sanskrit-heavy conversation**, you can later test:

```text
Sanskrit → SLM → Sanskrit
```

and eliminate the translation layer entirely.

---

# 3. Teach Mode

This is where I think your architecture can become **very good**.

Suppose the learner says:

> "I want to drink water."

You don't actually need an SLM.

```text
User speech
     ↓
ASR
     ↓
English text
     ↓
IndicTrans2
     ↓
मम जलं पातुम् इच्छा अस्ति
     ↓
Sanskrit TTS
     ↓
"मम जलं पातुम् इच्छा अस्ति"
```

Then UI:

> **I want to drink water.**

> **मम जलं पातुम् इच्छा अस्ति।**

> *mama jalaṃ pātum icchā asti*

> 🔊 Listen

This is much more deterministic.

---

# 4. IndicTrans2 is probably your most important NLP component

This is the one I'd test first.

IndicTrans2 supports **22 scheduled Indian languages**, including:

* Sanskrit
* Telugu
* Hindi
* Kannada
* Tamil
* Malayalam
* Bengali
* Marathi
* Gujarati
* English

and provides **Indic→Indic**, **Indic→English**, and **English→Indic** models. ([GitHub][1])

There is even a **distilled 320M Indic→Indic model**, which is much more interesting for your "run everything locally" requirement than the 1B model. ([Hugging Face][2])

So:

```text
Sanskrit ↔ Telugu
Sanskrit ↔ Hindi
Sanskrit ↔ Kannada
Sanskrit ↔ Tamil
Sanskrit ↔ Malayalam
...
```

can potentially be handled by **one translation model**.

That's a huge win.

---

# 5. You should add a Sanskrit deterministic NLP layer

This is something I would **not replace with an SLM**.

There are open-source Sanskrit NLP tools that can do things like:

```text
रामः गच्छति
      │
      ├── रामः
      │    ├── noun
      │    ├── masculine
      │    ├── singular
      │    └── nominative
      │
      └── गच्छति
           ├── verb
           ├── present
           ├── 3rd person
           └── singular
```

The `sanskrit_parser` project has explicit support for Sandhi and morphological analysis, including deriving forms from dhātu/lakāra/puruṣa/vacana and prātipadika/vibhakti/vacana. ([GitHub][3])

There is also Heritage.py, an interface to the Sanskrit Heritage system, supporting:

* morphological analysis
* Sandhi formation
* declensions
* conjugations. ([GitHub][4])

This becomes your **Sanskrit correctness engine**.

---

# 6. This gives you something much better than an SLM

Suppose the learner says:

> **रामः फलम् खादति।**

Your system can understand:

```text
रामः
  noun
  masculine
  singular
  nominative

फलम्
  noun
  neuter
  singular
  accusative

खादति
  verb
  present
  3rd person
  singular
```

Then your teaching engine can say:

> "Good! You used the nominative for रामः and accusative for फलम्."

That's much more trustworthy than:

```text
LLM: "Looks grammatically correct!"
```

---

# 7. Your SLM has a much smaller job

I'd make the SLM responsible for:

### Conversation management

```text
What should I say next?
```

### Natural responses

```text
User: What are you doing?

SLM:
अहं पठामि।
```

### Teaching

```text
Explain why "गच्छामि" is used here.
```

### Personalization

```text
User is beginner.
Use short Sanskrit sentences.
Explain difficult concepts in Telugu.
```

### But NOT:

* Sandhi analysis
* morphology
* translation when deterministic translation exists
* pronunciation evaluation
* grammatical truth
* Sanskrit word formation

Those should be handled by specialized components.

---

# 8. Which SLM?

I'd initially test **3–4B multilingual models**, rather than a huge 7B/14B model.

For example:

### Qwen 3 4B class

Good candidate for:

```text
Sanskrit conversation
English reasoning
Telugu/Hindi understanding
structured responses
```

### Gemma 3 4B class

Another candidate for the same layer.

### Aya / multilingual models

Worth testing if multilingual support becomes more important than raw reasoning.

But here's the important point:

**Don't decide based on the model's advertised multilingual capability.**

Create a benchmark of maybe **500 Sanskrit teaching/conversation prompts** and test:

```text
Sanskrit grammar
Sanskrit generation
Telugu → Sanskrit
English → Sanskrit
Sanskrit → English
conversation consistency
hallucination
beginner explanations
```

Then choose empirically.

---

# 9. I would build the system as "language middleware"

This is the architecture I think you're actually looking for:

```text
                 ┌────────────────────┐
                 │    YOUR UI         │
                 │                    │
                 │ "Talk to your      │
                 │  Sanskrit tutor"   │
                 └─────────┬──────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │ Conversation    │
                  │ Orchestrator    │
                  └────────┬────────┘
                           │
        ┌──────────────────┼───────────────────┐
        │                  │                   │
        ▼                  ▼                   ▼
   Speech layer       Sanskrit NLP       Translation
   Su-śrotā            Parser             IndicTrans2
        │                  │                   │
        └──────────────────┼───────────────────┘
                           │
                           ▼
                     Local SLM
                           │
                           ▼
                    Sanskrit output
                           │
                    ┌──────┴──────┐
                    ▼             ▼
                   TTS        Text renderer
```

The user sees **none of this**.

They simply see:

```text
        🎙️

   Speak to me...

        🔊

   नमस्ते।
   कथम् अस्ति भवान्?
```

---

# 10. The really interesting part: you can eventually remove the SLM from Teach Mode

I'd make the first implementation:

### Teach Mode

```text
Speech
 ↓
ASR
 ↓
Language detection
 ↓
Translation
 ↓
Sanskrit
 ↓
Sanskrit TTS
```

**No LLM.**

That gives you:

* deterministic behaviour
* low latency
* low memory
* no hallucination
* completely local
* cheap inference

Then:

### Conversation Mode

```text
Speech
 ↓
ASR
 ↓
Language normalization
 ↓
Sanskrit/English semantic representation
 ↓
SLM
 ↓
Sanskrit
 ↓
TTS
```

---

# 11. One additional thing I'd add: language identification

Because your goal is **global**, users might say:

> "I want to learn Sanskrit."

or:

> "నాకు సంస్కృతం నేర్చుకోవాలి."

or:

> "मुझे संस्कृत सीखनी है।"

You need an LID layer before translation.

So:

```text
Audio
 ↓
Language Identification
 ↓
┌────────┬────────┬────────┐
│ English│ Telugu │ Hindi  │ ...
└────────┴────────┴────────┘
 ↓
ASR
 ↓
Translation
```

For India-focused languages, AI4Bharat has a strong ecosystem around Indic language identification and NLP tooling.

---

# 12. My recommended MVP stack

I'd actually start with this:

```text
┌─────────────────────────────────────────┐
│              VAKYA / SHRUTI             │
├─────────────────────────────────────────┤
│ UI                                      │
│ React / Next.js                         │
├─────────────────────────────────────────┤
│ Orchestrator                            │
│ Python + FastAPI                        │
├─────────────────────────────────────────┤
│ Sanskrit ASR                             │
│ Su-śrotā / IndicConformer               │
├─────────────────────────────────────────┤
│ Translation                             │
│ IndicTrans2 Indic-Indic Distilled 320M │
├─────────────────────────────────────────┤
│ Sanskrit NLP                            │
│ sanskrit_parser                         │
│ Heritage                                │
├─────────────────────────────────────────┤
│ Conversation SLM                        │
│ Qwen/Gemma/Aya 3–4B class               │
├─────────────────────────────────────────┤
│ TTS                                     │
│ Sanskrit-capable local TTS              │
├─────────────────────────────────────────┤
│ Storage                                 │
│ PostgreSQL + local/object storage       │
└─────────────────────────────────────────┘
```

**IndicTrans2 320M is particularly attractive for your local architecture** because it supports the Indic↔Indic use case and is dramatically smaller than the 1B model. Its published checkpoint is MIT licensed. ([Hugging Face][2])

---

## The key design principle

I would make your system:

**ASR → NLP → Translation → SLM → Translation → TTS**

but **not every request has to traverse every component**.

Think of the SLM as the **brain/orchestrator**, not the entire language stack.

That gives you a much more robust system:

```text
                 ┌───────────────┐
                 │   Sanskrit    │
                 │   Knowledge   │
                 │     Layer     │
                 └───────┬───────┘
                         │
      ┌──────────────────┼──────────────────┐
      │                  │                  │
      ▼                  ▼                  ▼
    ASR                NLP             Translation
      │                  │                  │
      └──────────────────┼──────────────────┘
                         ▼
                       SLM
                         │
                         ▼
                      TTS
```

And **all of it can run locally**.

The next thing I'd do is a **model-by-model matrix of ~15 open-source candidates**, including **model size, RAM/VRAM requirement, Sanskrit capability, Telugu/English capability, license, CPU feasibility, GPU feasibility, and whether I would actually use it in Vākya/Shruti**. That will let us pick the exact stack rather than just listing models.

[1]: https://github.com/ai4bharat/IndicTrans2?utm_source=chatgpt.com "GitHub - AI4Bharat/IndicTrans2: Translation models for 22 scheduled languages of India · GitHub"
[2]: https://huggingface.co/ai4bharat/indictrans2-indic-indic-dist-320M?utm_source=chatgpt.com "ai4bharat/indictrans2-indic-indic-dist-320M · Hugging Face"
[3]: https://github.com/kmadathil/sanskrit_parser?utm_source=chatgpt.com "GitHub - kmadathil/sanskrit_parser: Parsers for Sanskrit / संस्कृतम् · GitHub"
[4]: https://github.com/hrishikeshrt/heritage?utm_source=chatgpt.com "GitHub - hrishikeshrt/heritage: Heritage.py -- Python Interface to The Sanskrit Heritage Site · GitHub"


Yes. For **your Sanskrit-learning app**, I would not try to find one giant model that does everything. The strongest architecture is a set of small local models, each doing one job well, behind a single simple UI.

One important correction from our previous discussion: **Su-śrotā is ASR, not TTS**. It converts Sanskrit speech → text. For text → Sanskrit speech, we need a separate TTS model.

## 1. My recommended local stack

| Function                        | Candidates                         |                 Size | License                                       | My pick                           |
| ------------------------------- | ---------------------------------- | -------------------: | --------------------------------------------- | --------------------------------- |
| **Sanskrit ASR**                | Su-śrotā, IndicConformer Sanskrit  |       ~129M / larger | Check upstream terms / MIT for IndicConformer | 🥇 **Su-śrotā**                   |
| **Indian-language ASR**         | IndicConformer 600M, Whisper       |          600M / 1.5B | MIT / Apache                                  | 🥇 **IndicConformer 600M**        |
| **English/global ASR**          | Whisper large-v3, faster-whisper   |                ~1.5B | Apache/MIT conversion                         | 🥇 **faster-whisper**             |
| **Indic translation**           | IndicTrans2 320M, IndicTrans3      |        320M / larger | MIT / CC-BY                                   | 🥇 **IndicTrans2 320M** initially |
| **English ↔ Indic translation** | IndicTrans2 200M, 1B               |            200M / 1B | MIT                                           | 🥇 **IndicTrans2 200M**           |
| **Sanskrit NLP**                | `sanskrit_parser`, Heritage        |        deterministic | MIT / GPL variants                            | 🥇 **sanskrit_parser**            |
| **Conversation SLM**            | Qwen3-4B, Phi-4-mini, Aya          |       4B / 3.8B / 8B | Apache/MIT/etc.                               | 🥇 **Qwen3-4B**                   |
| **Sanskrit TTS**                | Indic Parler-TTS, EdgeSanskrit-TTS | 0.9B / ~1.5GB bundle | Apache/MIT                                    | 🥇 **Indic Parler-TTS**           |
| **Teaching/grammar engine**     | Sanskrit parser + rules + SLM      |                    — | —                                             | 🥇 **Hybrid**                     |
| **Pronunciation evaluation**    | ASR + phoneme/alignment layer      |                    — | —                                             | 🥇 **Build on ASR**               |

---

# 2. Sanskrit → text: ASR

### Candidates

### 🥇 Su-śrotā — use this for Sanskrit learning

This remains my first choice for your **Sanskrit-specific speech recognition**.

Architecture:

```text
User speaks Sanskrit
       ↓
    Su-śrotā
       ↓
Sanskrit Devanagari text
       ↓
Sanskrit NLP
```

The reason I prefer it over a general ASR is that your application isn't a generic dictation app. You care about:

* Sanskrit phonetics
* Sandhi
* learner pronunciation
* Sanskrit vocabulary
* morphology
* sentence correctness

So a Sanskrit-specialized recognizer gives you a useful foundation.

But I would **not rely exclusively on it**.

---

### 🥈 IndicConformer 600M

AI4Bharat's multilingual IndicConformer supports all 22 scheduled Indian languages, including **Sanskrit and Telugu**, and is MIT licensed. It supports both CTC and RNNT decoding. ([Hugging Face][1])

[IndicConformer GitHub](https://github.com/AI4Bharat/IndicConformerASR?utm_source=chatgpt.com)

This is extremely useful for your architecture:

```text
             ┌── Sanskrit → Su-śrotā
             │
Audio → LID ─┼── Telugu/Hindi/etc → IndicConformer
             │
             └── English → Whisper
```

That means you don't have to force one ASR model to handle everything.

### My recommendation

**Use Su-śrotā when the user is speaking Sanskrit.**

Use **IndicConformer 600M** for Indian-language input.

---

# 3. English / global-language ASR

For your "anyone in the world can learn Sanskrit" goal, you'll eventually need English, German, French, Spanish, Japanese, etc.

### 🥇 faster-whisper

Whisper large-v3 supports around 100 languages and has an Apache-2.0 model; the CTranslate2 `faster-whisper` conversion is MIT licensed and makes local inference substantially more practical. ([Hugging Face][2])

[faster-whisper](https://github.com/SYSTRAN/faster-whisper?utm_source=chatgpt.com)

For your architecture:

```text
English/German/French/Japanese speech
                 ↓
           faster-whisper
                 ↓
             source text
```

You don't need this for the first India-focused MVP, but I would design the interface around an `ASRProvider` abstraction from day one.

---

# 4. Translation: the most important middleware

This is where your architecture becomes really interesting.

## 🥇 IndicTrans2 320M

For your use case, I'd start with:

**`ai4bharat/indictrans2-indic-indic-dist-320M`**

It supports 22 Indic languages, including Sanskrit and Telugu, and is MIT licensed. The published model is about 1.28 GB in safetensors form. ([GitHub][3])

[IndicTrans2 GitHub](https://github.com/AI4Bharat/IndicTrans2?utm_source=chatgpt.com)

This gives you:

```text
Telugu ↔ Sanskrit
Hindi  ↔ Sanskrit
Tamil  ↔ Sanskrit
Kannada ↔ Sanskrit
Malayalam ↔ Sanskrit
...
```

That's almost exactly what your app needs.

---

## 🥇 IndicTrans2 200M for English

For English ↔ Indic:

`indictrans2-en-indic-dist-200M`

and

`indictrans2-indic-en-dist-200M`

are the lightweight options. The published checkpoints are MIT licensed. ([Hugging Face][4])

So your translation layer can look like:

```text
              ┌── IndicTrans2 Indic→Indic
              │
Input text ───┼── IndicTrans2 Indic→English
              │
              └── IndicTrans2 English→Indic
```

---

# 5. IndicTrans3 — interesting upgrade

There is now **IndicTrans3-beta**, which supports Sanskrit, Telugu and other Indic languages and is designed for sentence/document-level translation. It is built on Gemma 3 and uses vLLM for inference. However, its current license is **CC BY 4.0**, rather than the simpler MIT licensing of IndicTrans2. ([Hugging Face][5])

So I would do:

```text
MVP:
IndicTrans2 320M / 200M

Later:
benchmark IndicTrans3 against it
```

Don't make IndicTrans3 a dependency until you've tested its actual Sanskrit quality on your dataset.

---

# 6. Sanskrit NLP — don't use an LLM for this

This is one of the most important architectural decisions.

Use deterministic Sanskrit NLP wherever possible.

### 🥇 `sanskrit_parser`

It can perform things such as:

* morphological analysis
* sentence validity
* pada analysis
* grammatical tagging
* dependency information
* sandhi-related processing
* Sanskrit generation

It is MIT licensed. ([GitHub][6])

[sanskrit_parser GitHub](https://github.com/kmadathil/sanskrit_parser?utm_source=chatgpt.com)

Your architecture becomes:

```text
"रामः वनं गच्छति"
          ↓
       Parser
          ↓
रामः → noun / nominative / singular
वनम् → noun / accusative / singular
गच्छति → verb / 3rd person / singular
          ↓
Grammar representation
```

This is much safer than asking an SLM:

> "Is this Sanskrit sentence grammatically correct?"

---

# 7. The SLM for actual conversation

This is where I would put the LLM.

## 🥇 Qwen3-4B

For your first local conversational model, I'd choose **Qwen3-4B**.

It is Apache-2.0 licensed and explicitly designed for instruction following, reasoning, agent-style tasks and multilingual use. ([Hugging Face][7])

[Qwen3-4B](https://huggingface.co/Qwen/Qwen3-4B?utm_source=chatgpt.com)

But here's the important part:

**I would NOT ask Qwen to be your Sanskrit translator.**

Instead:

```text
             Sanskrit
                ↓
           Translation
                ↓
        semantic English
                ↓
             Qwen
                ↓
        semantic English
                ↓
           Translation
                ↓
             Sanskrit
```

That makes the SLM's job dramatically easier.

---

# 8. Why Qwen instead of Phi-4-mini?

Phi-4-mini is 3.8B parameters, MIT licensed, with a 128K context window. ([Hugging Face][8])

It's a very good local model.

But its documented supported languages don't include Sanskrit, Telugu or Hindi, whereas Qwen3 has much broader multilingual positioning. ([Hugging Face][9])

For **your specific architecture**, therefore:

```text
Qwen3-4B
   ↓
Conversation brain
```

while:

```text
IndicTrans2
   ↓
Language brain
```

This separation is exactly what I want for your product.

---

# 9. Aya Expanse

Aya Expanse 8B is another interesting multilingual SLM.

It supports 23 languages including English, Hindi, Arabic, Chinese, Japanese, etc. ([Hugging Face][10])

But Sanskrit and Telugu aren't among its documented 23-language set.

So I wouldn't make it the primary model for your architecture.

It could be an excellent **benchmark candidate** later.

---

# 10. Sanskrit TTS — this changed my recommendation

There is now a particularly interesting option:

## 🥇 Indic Parler-TTS

This is probably the most important discovery for your stack.

AI4Bharat's **Indic Parler-TTS** officially supports Sanskrit **and Telugu**, along with many other Indian languages and English. It has a 0.9B parameter model and is Apache-2.0 licensed. ([Hugging Face][11])

It even lists a dedicated Sanskrit voice:

> Aryan

and supports conversational/emotional style control for Sanskrit. ([Hugging Face][12])

[Indic Parler-TTS](https://huggingface.co/ai4bharat/indic-parler-tts?utm_source=chatgpt.com)

This is almost tailor-made for your application.

---

# 11. EdgeSanskrit-TTS

There's also a newer project called **EdgeSanskrit-TTS**, explicitly designed for offline Sanskrit TTS and CPU/edge inference. It is MIT licensed and builds around IndicF5-inspired components plus Sanskrit-specific phonetic rules. ([GitHub][13])

[EdgeSanskrit-TTS](https://github.com/Hariprajwal/EdgeSanskrit-TTS?utm_source=chatgpt.com)

I would **benchmark this against Indic Parler-TTS**.

My current split would be:

```text
High quality / GPU
        ↓
Indic Parler-TTS

Low-resource / CPU / edge
        ↓
EdgeSanskrit-TTS
```

---

# 12. IndicF5 is NOT your Sanskrit TTS

This is worth explicitly calling out.

IndicF5 is an excellent multilingual TTS model, but its currently documented 11 languages are:

* Assamese
* Bengali
* Gujarati
* Hindi
* Kannada
* Malayalam
* Marathi
* Odia
* Punjabi
* Tamil
* Telugu

**Sanskrit is not on that list.** ([GitHub][14])

So don't use IndicF5 as the primary Sanskrit voice.

It could still be useful for **Telugu/Hindi/etc. TTS** if you ever want the tutor to explain something in the user's native language.

---

# 13. Your final architecture

This is what I would actually build.

```text
                         ┌───────────────────────┐
                         │      SIMPLE UI        │
                         │                       │
                         │  🎤 Speak             │
                         │  🔊 Listen            │
                         │  📖 Learn             │
                         └───────────┬───────────┘
                                     │
                                     ▼
                         ┌───────────────────────┐
                         │ Conversation Manager  │
                         └───────────┬───────────┘
                                     │
                         ┌───────────▼───────────┐
                         │ Language Detection    │
                         └───────────┬───────────┘
                                     │
             ┌───────────────────────┼──────────────────────┐
             │                       │                      │
             ▼                       ▼                      ▼
      Sanskrit speech          Indian speech          Global speech
             │                       │                      │
             ▼                       ▼                      ▼
        Su-śrotā              IndicConformer         faster-whisper
             │                       │                      │
             └───────────────────────┼──────────────────────┘
                                     ▼
                              Source Text
                                     │
                                     ▼
                         ┌───────────────────────┐
                         │   Sanskrit NLP       │
                         │                       │
                         │ morphology            │
                         │ grammar               │
                         │ sandhi                │
                         │ vocabulary            │
                         └───────────┬───────────┘
                                     │
                                     ▼
                              Translation
                                     │
                       ┌─────────────┴─────────────┐
                       │                           │
                       ▼                           ▼
                 Teach Mode                Conversation
                       │                           │
                       │                           ▼
                       │                     Qwen3-4B
                       │                           │
                       │                           ▼
                       │                    Response meaning
                       │                           │
                       └─────────────┬─────────────┘
                                     ▼
                              IndicTrans2
                                     │
                                     ▼
                                  Sanskrit
                                     │
                                     ▼
                              Sanskrit NLP
                         grammar / sandhi / cleanup
                                     │
                                     ▼
                            Indic Parler-TTS
                                     │
                                     ▼
                                  🔊 Voice
```

---

# 14. Teach Mode becomes surprisingly simple

Your second requirement:

> "Just translate the other language user is speaking into Sanskrit and use the above model to utter the response."

Exactly.

### Example

User:

> "I want to learn Sanskrit."

```text
English speech
      ↓
faster-whisper
      ↓
"I want to learn Sanskrit."
      ↓
IndicTrans2
      ↓
"अहं संस्कृतम् अधिगन्तुम् इच्छामि।"
      ↓
Sanskrit NLP
      ↓
validate / normalize
      ↓
Indic Parler-TTS
      ↓
🔊 "अहं संस्कृतम् अधिगन्तुम् इच्छामि।"
```

**No Qwen required.**

That's important because it makes Teach Mode:

* cheaper
* faster
* deterministic
* easier to debug
* easier to run entirely offline

---

# 15. Conversation Mode

Suppose the learner says:

> "What did you do today?"

Eventually:

```text
English
  ↓
Whisper
  ↓
"What did you do today?"
  ↓
Semantic representation
  ↓
Qwen
  ↓
"I went to the temple and studied Sanskrit."
  ↓
IndicTrans2
  ↓
"अहं देवालयं गत्वा संस्कृतम् अपठम्।"
  ↓
Sanskrit NLP
  ↓
grammar/sandhi verification
  ↓
TTS
  ↓
🔊
```

The learner never knows that **five different models** were involved.

That's exactly what you want.

---

# 16. And there is an even better architecture

Don't make the SLM produce Sanskrit directly.

Give Qwen a **language-neutral semantic contract**.

For example:

```json
{
  "intent": "daily_activity",
  "speaker": "assistant",
  "content": "I went to the temple and studied Sanskrit.",
  "emotion": "friendly",
  "difficulty": "beginner",
  "target_language": "Sanskrit"
}
```

Then:

```text
Qwen
 ↓
Semantic response
 ↓
Translation engine
 ↓
Sanskrit
 ↓
Grammar engine
 ↓
TTS
```

This gives you a very powerful property:

### Your SLM doesn't need to know Sanskrit.

It only needs to know:

> **How should the tutor behave?**

The Sanskrit stack handles:

> **How should that meaning be expressed correctly in Sanskrit?**

---

# 17. This is the stack I'd freeze for MVP

### Speech

| Component    | Choice                  |
| ------------ | ----------------------- |
| Sanskrit ASR | **Su-śrotā**            |
| Indian ASR   | **IndicConformer 600M** |
| Global ASR   | **faster-whisper**      |

### Language

| Component           | Choice                      |
| ------------------- | --------------------------- |
| Sanskrit ↔ Indic    | **IndicTrans2 320M**        |
| English ↔ Indic     | **IndicTrans2 200M**        |
| Sanskrit morphology | **sanskrit_parser**         |
| Sanskrit grammar    | **sanskrit_parser + rules** |
| Sandhi              | **Sanskrit NLP layer**      |

### Intelligence

| Component           | Choice                                |
| ------------------- | ------------------------------------- |
| Conversation        | **Qwen3-4B**                          |
| Teaching logic      | **deterministic orchestrator + Qwen** |
| Adaptive curriculum | **your own learner model**            |

### Voice

| Component         | Choice                         |
| ----------------- | ------------------------------ |
| Sanskrit TTS      | **Indic Parler-TTS**           |
| CPU/edge Sanskrit | **EdgeSanskrit-TTS**           |
| Telugu/Hindi TTS  | **Indic Parler-TTS / IndicF5** |

---

# 18. What this means for your actual product

The beautiful part is that **your moat isn't any individual model**.

Most of these components are replaceable:

```text
              ┌────────────────────┐
              │    VĀKYA / BRAND   │
              │                    │
              │ Sanskrit Teacher   │
              └─────────┬──────────┘
                        │
              YOUR ORCHESTRATION
                        │
        ┌───────────────┼────────────────┐
        │               │                │
      ASR             NLP             SLM
        │               │                │
    replaceable     replaceable      replaceable
        │               │                │
        └───────────────┼────────────────┘
                        │
                       TTS
                        │
                    replaceable
```

Your actual IP becomes:

1. **Sanskrit curriculum**
2. **conversation design**
3. **grammar engine**
4. **learner model**
5. **pronunciation scoring**
6. **error taxonomy**
7. **lesson progression**
8. **Sanskrit-specific evaluation data**
9. **orchestration**
10. **UX**
11. **eventually your own fine-tuned models**

That is much more defensible than simply building a wrapper around an LLM.

---

## My final picks

If I had to start coding **today**, I'd use:

**ASR**
→ Su-śrotā + IndicConformer 600M + faster-whisper

**Translation**
→ IndicTrans2 320M + 200M

**Sanskrit intelligence**
→ `sanskrit_parser` + your own Sanskrit rules

**Conversation**
→ Qwen3-4B

**TTS**
→ Indic Parler-TTS

**CPU fallback**
→ EdgeSanskrit-TTS

And crucially:

> **Teach Mode does not need an SLM. Conversation Mode does.**

That gives you a surprisingly capable **100% local Sanskrit tutor** without needing a giant 30B/70B model.

One licensing caveat: although the model licenses above are permissive, **training-data licenses, gated-model access terms, voice-cloning restrictions, and downstream commercial use should each be tracked separately**. For example, Indic Parler-TTS is Apache-2.0, while its training sources have their own terms; IndicF5 also has explicit voice-cloning restrictions. ([Hugging Face][11])

[1]: https://huggingface.co/ai4bharat/indic-conformer-600m-multilingual?utm_source=chatgpt.com "ai4bharat/indic-conformer-600m-multilingual · Hugging Face"
[2]: https://huggingface.co/openai/whisper-large-v3?utm_source=chatgpt.com "openai/whisper-large-v3 · Hugging Face"
[3]: https://github.com/ai4bharat/IndicTrans2?utm_source=chatgpt.com "GitHub - AI4Bharat/IndicTrans2: Translation models for 22 scheduled languages of India · GitHub"
[4]: https://huggingface.co/ai4bharat/indictrans2-en-indic-dist-200M/blob/main/LICENSE?utm_source=chatgpt.com "LICENSE · ai4bharat/indictrans2-en-indic-dist-200M at main"
[5]: https://huggingface.co/ai4bharat/IndicTrans3-beta?utm_source=chatgpt.com "ai4bharat/IndicTrans3-beta · Hugging Face"
[6]: https://github.com/kmadathil/sanskrit_parser?utm_source=chatgpt.com "GitHub - kmadathil/sanskrit_parser: Parsers for Sanskrit / संस्कृतम् · GitHub"
[7]: https://huggingface.co/Qwen/Qwen3-4B?utm_source=chatgpt.com "Qwen/Qwen3-4B · Hugging Face"
[8]: https://huggingface.co/microsoft/Phi-4-mini-instruct/tree/main?utm_source=chatgpt.com "microsoft/Phi-4-mini-instruct at main"
[9]: https://huggingface.co/microsoft/Phi-4-mini-instruct?utm_source=chatgpt.com "microsoft/Phi-4-mini-instruct · Hugging Face"
[10]: https://huggingface.co/CohereLabs/aya-expanse-8b/blob/main/README.md?utm_source=chatgpt.com "README.md · CohereLabs/aya-expanse-8b at main"
[11]: https://huggingface.co/ai4bharat/indic-parler-tts?utm_source=chatgpt.com "ai4bharat/indic-parler-tts · Hugging Face"
[12]: https://huggingface.co/ai4bharat/indic-parler-tts/blob/main/README.md?utm_source=chatgpt.com "README.md · ai4bharat/indic-parler-tts at main"
[13]: https://github.com/Hariprajwal/EdgeSanskrit-TTS?utm_source=chatgpt.com "GitHub - Hariprajwal/EdgeSanskrit-TTS: Open source lightweight Sanskrit language model optimized for CPU, edge devices, and offline inference. · GitHub"
[14]: https://github.com/AI4Bharat/IndicF5/blob/main/README.md?utm_source=chatgpt.com "IndicF5/README.md at main · AI4Bharat/IndicF5 · GitHub"

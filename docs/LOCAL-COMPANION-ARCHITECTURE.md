# Vākya local companion architecture

Status: implementation design, 2 October 2026. Model activation and measured results are recorded separately below; this document is not a claim that every candidate is running.

## Hosting direction update — 2 October 2026

After this local-companion increment, the owner clarified that the public client should be backed by a hosted model container. **Public learners should not perform local setup or pairing.** The loopback design below remains the offline/development architecture, not the final hosted product experience.

The hosted target is `Pages client -> HTTPS model API -> server-managed model providers`. Model acquisition, credentials, runtime dependencies, and hardware belong on the server. The client needs a verified endpoint and capabilities contract; the service needs an explicit public-access/authentication policy, origin restrictions, bounded concurrency, quotas, and error handling. A shared server secret must not be embedded in the static app.

The existing `azure/tts` source implements only `/health` and `/v1/speak`. It is not a deployment of all companion providers. Read-only inspection of the shown Azure resource group found a registry and Container Apps environment, but no Container App endpoint. No cloud infrastructure was created or altered as part of this publication.

The current publication includes the local UI and server source, not a completed hosted migration. The Pages workflow can receive public TTS and existing tutor API origins through repository variables. The local tutor transport remains explicitly loopback-only until the hosted API contract is available.

## 1. Product and runtime boundaries

Vākya teaches Sanskrit using a separately chosen support language. Keep Expo, the existing curriculum, English/Hindi/Telugu UI dictionaries, shareable language URLs, local progress, and the verified Su-shrota browser worker.

The owner selected a **local Python companion** for additional models and agreed to obtain gated-model access. No accounts, PostgreSQL, cloud audio storage, or migration to Next.js are needed.

```text
GitHub Pages / localhost / Expo UI
  |-- local preferences, curriculum, localized UI
  |-- microphone -> browser Su-shrota worker -> editable Sanskrit
  |
  | explicit connection + loopback bearer token
  v
127.0.0.1:8765 companion
  |-- origin/host validation, request limits, capability report
  |-- deterministic request routing; one inference job at a time
  |-- Teach: source -> IndicTrans2 -> Sanskrit + IAST
  |-- Analyze: Sanskrit -> candidate morphology (not correctness)
  |-- Converse: source -> English -> local SLM contract
  |                              -> Sanskrit + support explanation
  |-- Speak: Sanskrit -> independent Sanskrit TTS -> WAV
  |
  +-- approved, pinned model files on local disk
```

GitHub Pages cannot run Python or hold private credentials. The companion is a separate process on the learner's computer. `127.0.0.1` on a phone means that phone, not the desktop: native phone-to-desktop access is **not** enabled by binding to all interfaces. A future LAN deployment needs TLS, explicit device pairing, origin policy, and its own threat model.

## 2. Correctness rules

1. ASR, translation, morphology, conversation, and synthesis are different capabilities.
2. Preserve the source language, source text, model provenance, and machine-generated status.
3. Never claim that translation or a parse proves correctness.
4. Sanskrit remains canonical Devanagari; IAST is deterministic transliteration.
5. Explicit source selection precedes automatic language identification.
6. Model missing, access denied, malformed output, unsupported language, timeout, and busy are errors, not canned “successful” replies.
7. Do not silently use OpenAI, OpenRouter, browser Hindi speech, or an online Heritage endpoint as a local-provider fallback.
8. Plain English inside JSON is an English pivot, not a language-neutral representation.
9. A request may bypass irrelevant stages. Teach does not invoke the conversational model.

## 3. Model shortlist and resource assessment

Memory below is **planning guidance**, not a measurement. FP32 weight storage is roughly 4 bytes/parameter; FP16 roughly 2; 4-bit packages have scale/metadata overhead. Runtime activations, KV caches, audio buffers, Python, and OS memory are additional. Browser compatibility is not implied by “local.”

| Candidate | Role / Sanskrit relevance | Size / weight guidance | License/access evidence | Decision |
| --- | --- | --- | --- | --- |
| Su-shrota v13b ONNX community export | Sanskrit ASR | Existing int8 download 187 MB; runtime RAM higher | Preserve existing upstream/conversion provenance caveats | Reuse verified browser worker |
| IndicConformer 600M multilingual | Indic ASR; language-specific decoding | Rough FP32 lower bound 2.4 GB; ONNX assets vary | Official metadata MIT, gated | Later source-language speech; not needed for typed Teach |
| faster-whisper small | English/global ASR via CTranslate2 | 244M class; int8 CPU candidate | Verify exact converted checkpoint separately from MIT runtime | Benchmark before large-v3 |
| Whisper large-v3 | Global ASR, not a Sanskrit accuracy guarantee | ~1.55B; FP16 weights ~3.1 GB | Official model card Apache-2.0; runtime license separate | Too costly as initial laptop default |
| IndicTrans2 en-indic dist 200M | English→Sanskrit/Hindi/Telugu | ~0.8 GB FP32 class | Official metadata MIT, auto-gated, custom code | Primary Teach direction |
| IndicTrans2 indic-en dist 200M | Sanskrit/Hindi/Telugu→English | ~0.8 GB FP32 class | Official metadata MIT, auto-gated, custom code | Conversation normalization |
| IndicTrans2 indic-indic dist 320M | Telugu/Hindi↔Sanskrit | 320,861,184 params; ~1.28 GB FP32 | Official metadata MIT, auto-gated, custom code | Primary Indic Teach direction |
| IndicTrans2 1B directions | Higher-capacity translation comparator | ~4 GB FP32 per direction | Verify selected checkpoint terms | Benchmark only |
| IndicTrans3-beta | Larger translation comparator | Repository reports ~17.2 GB aggregate storage; not an inference RAM estimate | Metadata Gemma3-derived, CC-BY-4.0, auto-gated | Defer; upstream/base obligations need review |
| sanskrit_parser | Lexical and sandhi candidate analysis | Data/dependencies dominate; measure install/RSS | Source MIT claim; lexical datasets have separate provenance | Use candidate tags, no “grammar passed” badge |
| Sanskrit Heritage / Heritage.py | Morphology/interface candidate | A wrapper is not the whole linguistic engine | Offline engine/data and wrapper licenses need separate verification | No remote-service dependency in local mode |
| Qwen3-4B | English-pivot conversation | 4B; ~8 GB FP16, ~2–3 GB quantized weights plus runtime | Official card Apache-2.0 | Local bounded non-thinking provider, benchmark before default |
| Phi-4-mini-instruct | English reasoning comparator | 3.8B; ~7.6 GB FP16 | Official card MIT; advertised language list lacks Sanskrit/Telugu/Hindi | Comparator, not Sanskrit oracle |
| Aya Expanse 8B | Multilingual comparator | ~16 GB FP16; quantization needed | Do not assume permissive commercial use; confirm exact model terms | Defer; no demonstrated Sanskrit/Telugu advantage |
| Indic Parler-TTS | Advertises Sanskrit/Telugu synthesis | 937,803,241 FP32 params; ~3.75 GB weights | Official metadata Apache-2.0, auto-gated | Primary synthesis candidate; separate runtime compatibility gate |
| EdgeSanskrit-TTS | CPU chant/phonetic experiment | README claims ~1.5 GB bundle; unmeasured | MIT repository claim; derived weights/data separate; cloud translation path exists | Benchmark only; not a fallback |
| IndicF5 / Vagdhenu | Indic support-language TTS / Sanskrit chant research | Separate models/runtime budgets | IndicF5 advertised language list is not proof of Sanskrit support | Keep distinct; no unvalidated voice cloning |

The development machine has 16 GiB unified memory and Apple Silicon. Do not preload all directions, Qwen, and Parler together. CPU is the portability baseline for translation. MPS/MLX/GGUF acceleration must be individually tested; CUDA-only quantization is not a macOS plan.

## 4. Model provenance and provisioning

Pin approved checkpoints, not floating `main`:

| Provider | Repository | Assessed revision |
| --- | --- | --- |
| English→Indic | `ai4bharat/indictrans2-en-indic-dist-200M` | `173b94239f7c38886b2747b8d4a5db771a7e1232` |
| Indic→English | `ai4bharat/indictrans2-indic-en-dist-200M` | `eb9e49d81077cfc5311e82ff36d8c1fc11557b5d` |
| Indic→Indic | `ai4bharat/indictrans2-indic-indic-dist-320M` | `ffb7582b6d43791f1fb26b2153fc065f2e9ea575` |
| Indic Parler | `ai4bharat/indic-parler-tts` | `7b527af5ee8ed1f9a28d80b19703ed9bb8ba10ca` |

Separate provisioning from serving. The provisioning CLI downloads a selected checkpoint only after explicit action. Hugging Face authentication remains in its local credential store/environment; the service does not expose it. Prefer safetensors over pickle checkpoints. Record the exact snapshot and required tokenizer/processor/runtime versions.

IndicTrans2 uses custom model code and IndicTransToolkit normalization/entity handling. Pin and inspect that code; do not replace preprocessing with a generic translation pipeline. Inference uses only provisioned local files and offline library settings. Missing files never trigger a request-time download.

Keep virtual environments, weights, pairing tokens, recordings, and generated audio outside version control. Package locks and small evaluation fixtures may be committed. Do not redistribute gated weights through Pages.

## 5. Companion API

Versioned prefix: `/v1`. All payloads are JSON except an audio response. Four source codes initially: `en`, `hi`, `te`, `sa`. UI locale is a separate `supportLanguage`.

| Endpoint | Contract |
| --- | --- |
| `GET /v1/capabilities` | Authenticated provider states, supported source codes, protocol version. No local filesystem paths or tokens. |
| `POST /v1/teach` | `{text, sourceLanguage}` -> `{sanskrit, transliteration, provider, warnings}` |
| `POST /v1/analyze` | `{text}` -> candidate word/root/tag data, provider, ambiguity warning; no boolean grammaticality verdict |
| `POST /v1/converse` | `{text, sourceLanguage, supportLanguage, level, history}` -> Sanskrit, IAST, support explanation, provenance |
| `POST /v1/speak` | `{text}` -> `audio/wav`; unavailable until Sanskrit TTS is activated |

Requests are bounded by text length, history length, generation length, and audio duration. Source language and difficulty are enums. Reject unknown fields. Error shape: `{error: {code, message}}`; codes include `unauthorized`, `invalid_request`, `provider_unavailable`, `busy`, `inference_failed`, and `invalid_output`.

Capabilities mean operational readiness only after required files/dependencies are present; “installed” is not “quality approved.” Return unavailable details without pretending to translate.

## 6. Orchestration

### Teach

1. Learner explicitly chooses source language and submits text.
2. `sa` bypasses translation and receives Unicode normalization/IAST only.
3. `en` selects English→Indic; `hi`/`te` select Indic→Indic.
4. Perform upstream preprocessing, bounded generation, postprocessing, and output-shape checks.
5. Return Sanskrit with an explicit machine-translation notice. Morphological analysis and listening are separate actions, so failure of either cannot erase a valid translation.

### Conversation

1. Preserve original input and explicitly selected source language.
2. Normalize to English where needed using Indic→English.
3. Feed a bounded English history to the local conversation provider.
4. Validate a small JSON contract: an English reply plus an English teaching explanation. No tools, arbitrary URLs, filesystem access, or code execution.
5. Translate reply English→Sanskrit and explanation English→support language.
6. Return text and provenance. If any required stage fails, report failure rather than inventing a Sanskrit response.

The existing OpenAI lesson path is preserved as a distinct mode, never an automatic local fallback. Earlier generated chat replies remain in their original language as in the current app.

### Speech

Existing Su-shrota output is editable Sanskrit input. “Use transcript” fills the local tutor input and selects `sa`; it does not automatically send data.

Do not send Telugu/English audio through the Sanskrit recognizer. Multilingual recording and LID require their own provider contracts and quality tests. For TTS, generate local WAV and play only after a user gesture. Device speech remains distinct and is not labelled validated Sanskrit synthesis.

## 7. Local transport and privacy

- Bind only `127.0.0.1`; validate `Host` to resist DNS rebinding.
- Use a random per-install pairing token, stored with owner-only permissions. This is device authorization, not a user account.
- Require bearer authorization for capabilities and inference. No token in a URL; keep browser pairing credentials in memory, not share links.
- Allow only explicit localhost development and `https://charannampally.github.io` origins; no `*` CORS or wildcard credentials.
- Permit preflight without inference/auth side effects. Private-network permission headers must be scoped to approved origins. Browsers may still require local-network permission or reject public-HTTPS→loopback access.
- Provide localhost frontend instructions as the fallback; do not disable browser protections.
- Browser disconnection cancels result delivery. A synchronous model call may finish before releasing the single inference slot; document this rather than claim hard cancellation.
- Never log user text, audio, tokens, or provider credentials. Log operation names and error types. Do not add telemetry.
- No model download, shell command, package install, or model path supplied by an HTTP request.

## 8. UI

Add a localized Local Tutor surface, accessible before onboarding and from navigation. Pair explicitly, show provider readiness, choose Teach/Conversation/Analyze, and choose source language independently of UI language.

Render Sanskrit, IAST, machine-output warnings, candidate morphology, and a separate local-listen action. Disable unavailable capabilities with a reason. Keep editable input across locale changes. Do not reset the browser ASR worker on a locale change. Reuse the existing visual system and existing `?lang=` semantics.

The local tutor route is `?mode=tutor&lang=te`; language switching preserves the mode. Connection secrets are never shareable. Display that every recipient needs their own companion.

## 9. Resource and failure policy

One heavy inference job at a time; return `busy` instead of accumulating a queue. Lazy model loading, bounded output, CPU thread limits, and release between heavyweight stages protect the 16 GiB development machine.

Core transport and transliteration must start without neural-model downloads. Missing optional packages produce explicit unavailable capability states. Fatal configuration errors stop startup with actionable diagnostics; do not broadly catch and report healthy status.

No measured latency/accuracy is promised in advance. Startup capability checks should not load gigabytes of models. Record cold/warm runtime, peak memory, output, hardware, and model revision during real validation.

## 10. Validation and release gates

- Unit tests: directional routing, input/history validation, output schema, unavailable/busy behavior, authentication, origin/host rejection, and no inference on preflight.
- Integration: live loopback HTTP tests against the actual service, IAST, and real lexical analysis when installed.
- Frontend: pairing errors, mode/source selection, localization without state loss, unavailable controls, cancellation/stale response protection, and no cloud fallback.
- Real models: English/Hindi/Telugu→Sanskrit, Sanskrit→English, and a Sanskrit synthesis clip. Store only public test sentences/results. Mock results must be labelled as mocks.
- Regression: existing unit tests, web/native exports, Pages subpath behavior, lessons, and Su-shrota inference.
- Expand to a versioned 500-item evaluation set before quality claims. Include negation, gender/number, tense, entities, questions, code mixing, unsupported forms, and pedagogical explanations.
- Human Sanskrit review evaluates adequacy, grammar, pronunciation, and teaching correctness. Back-translation and parser coverage are diagnostics, not truth labels.
- Initial engineering targets: zero silent provider substitutions; zero credential/transcript leakage in logs; complete error schemas; UI locale changes without network requests. Throughput thresholds follow measurements, not parameter-count guesses.

## 11. Delivery stages

1. **Foundation and text-first UI:** pairing, provider states, Teach/Analyze/Converse contracts, IAST, tests, operating instructions.
2. **Approved translation/NLP activation:** isolated Python runtime, approved pinned weights, actual outputs/measurements, provider failure tests.
3. **Conversation and TTS activation:** choose a local SLM runtime compatible with available hardware; isolate conflicting TTS dependencies if necessary; validate real audio before claiming speech support.
4. **Additional speech and pedagogy:** source-language ASR, LID, morphology explanations, adaptive practice, and calibrated pronunciation feedback.

Implement incrementally without claiming later stages complete. Do not automatically push/deploy this work until the owner requests publication; the existing live Pages release remains unchanged during development.

## 12. Sources

- [Original brainstorm and corrections](./Brainstorm.md)
- [IndicTrans2 source and language list](https://github.com/AI4Bharat/IndicTrans2)
- [Upstream inference example](https://github.com/AI4Bharat/IndicTrans2/blob/main/huggingface_interface/example.py)
- [IndicTransToolkit](https://github.com/VarunGumma/IndicTransToolkit)
- [IndicTrans2 en→Indic metadata](https://huggingface.co/api/models/ai4bharat/indictrans2-en-indic-dist-200M)
- [IndicTrans2 Indic→en metadata](https://huggingface.co/api/models/ai4bharat/indictrans2-indic-en-dist-200M)
- [IndicTrans2 Indic→Indic metadata](https://huggingface.co/api/models/ai4bharat/indictrans2-indic-indic-dist-320M)
- [Indic Parler metadata](https://huggingface.co/api/models/ai4bharat/indic-parler-tts)
- [IndicConformer metadata](https://huggingface.co/api/models/ai4bharat/indic-conformer-600m-multilingual)
- [IndicTrans3 metadata](https://huggingface.co/api/models/ai4bharat/IndicTrans3-beta)
- [sanskrit_parser](https://github.com/kmadathil/sanskrit_parser)
- [Qwen3-4B](https://huggingface.co/Qwen/Qwen3-4B)
- [Phi-4-mini](https://huggingface.co/microsoft/Phi-4-mini-instruct)
- [EdgeSanskrit-TTS](https://github.com/Hariprajwal/EdgeSanskrit-TTS)

## 13. Implementation evidence

Architecture was written before companion implementation. The following results were measured on the development machine on 2 October 2026.

### Delivered increment

| Surface | Status / evidence |
| --- | --- |
| Loopback service and pairing | Implemented and running on port 8765. Actual authenticated requests succeed; missing token returns 401. Origins/hosts, 16 KiB body limit, enums, history limits, and single-job admission are tested. |
| Local Tutor UI | Implemented at `?mode=tutor`, in navigation, and before onboarding. English/Hindi/Telugu localization, independent input language, provider readiness, cancellation, bounded conversation history, and editable browser-ASR handoff are wired. |
| Sanskrit identity / IAST | Actual browser→companion→UI test passes: `नमस्ते` → `namaste`. This is normalization/transliteration, not translation. |
| Candidate morphology | Actual `sanskrit_parser`/local INRIA lookup works for `रामः फलम् खादति।`. Runtime testing exposed a visarga-normalization issue; using the upstream normalized-input mode corrected `रामः` lookup. It remains lexical candidates for pre-separated words, not full sentence validation. |
| IndicTrans2 adapter | Directional routing, upstream processor calls, local-files-only loading, safe weight format, bounded generation, and explicit errors are implemented. Actual neural translation **not verified**: approved-account login worked, but the en→Indic weight request still returned an access denial. |
| Gated-model decision | After the denial, the owner chose to continue with available providers and record the blocker. Further IndicTrans2 and Parler activation is deferred; no alternative account, mirror, cloud model, or canned translation was substituted. |
| Qwen3-4B MLX | Pinned 4-bit checkpoint downloaded and real offline English-planner inference executed. This verifies model execution and structured output, not the complete Sanskrit conversation pipeline. |
| Full local Sanskrit conversation | Orchestration implemented and fixture-tested; unavailable in the UI because translation weights are missing. Also requires explicit `VAKYA_EXPERIMENTAL_CONVERSATION=1`, even after weights are installed. |
| Sanskrit TTS | **Not implemented/activated** beyond the versioned unavailable endpoint and explicit UI notice. Upstream Parler pins Transformers 4.46.1 while the current translation/Qwen environment uses 4.51.3. Use a separate future worker, not an incompatible combined installation. No substitute browser/Hindi voice. |
| Multilingual microphone ASR / LID / pronunciation scores | **Not implemented in this increment.** Existing Sanskrit Su-shrota recording/upload/sample flow is preserved and regression-tested with actual model inference. |

### Actual Qwen findings

The first greedy-decoding trial produced repetitive, unterminated JSON. Non-thinking sampling was changed to temperature 0.7, top-p 0.8, top-k 20, repetition penalty 1.1, and a 256-token output cap.

Three subsequent requests returned valid JSON, but one claimed **“Kaise” was Sanskrit**. That is a real language/teaching error, not a formatting issue. The prompt was narrowed to English conversational planning and general encouragement, explicitly excluding invented vocabulary, translations, and grammar rules. Conversation remains experimental/off by default; three passing smoke prompts do not close the quality gate.

Final prompt smoke test, seeded with 42 for evaluation only:

| Public input | Actual reply | Elapsed |
| --- | --- | --- |
| I want to learn Sanskrit. Please greet me. | Hello! Welcome to learning Sanskrit. It's a beautiful and ancient language with a rich tradition. | 6.45 s |
| What are you doing today? | I'm helping people learn Sanskrit. What about you? | 3.41 s |
| Help me practise a simple question. | How are you today? | 3.03 s |

All three produced the required `reply` and `explanation` strings. Peak process RSS reported by macOS was approximately **2,024 MiB**, after adding MLX cache release. This is not a total-machine or comprehensive GPU-memory measurement, nor a guarantee for longer histories. No Sanskrit translation or synthesized audio was generated by this test.

### Validation record

- 30 TypeScript unit tests passed.
- 21 Python tests passed, including real IAST and actual installed morphological lookup. One upstream test-client deprecation warning remains.
- A combined affected end-to-end run passed 24 tests, with two deliberate mobile skips for heavyweight/live-desktop checks. It covered real browser pairing/IAST/morphology, original learning flows, localization, and actual Su-shrota inference.
- Neural translation and full conversation UI results in fixture tests are explicitly labelled fixtures, not model evidence.
- Web, iOS, and Android JavaScript/Hermes exports pass. Physical mobile binaries and native companion pairing were not tested.
- The [Python lock snapshot](../companion/requirements-lock.txt) records the tested Python 3.11/Apple Silicon environment. Initial download-proxy failures were resolved by installing the core separately and constraining the filesystem dependency before installing model extras.
- No new GitHub commit, push, or deployment was performed for this development increment.

### Next release gates

1. Resolve gated-model authorization, provision all three pinned IndicTrans2 checkpoints, and run real English/Hindi/Telugu→Sanskrit tests.
2. Check translation adequacy/negation/entities with a Sanskrit reviewer; do not accept parser coverage as quality proof.
3. Implement an isolated Parler worker, provision its tokenizer/weights, then measure and listen to actual Sanskrit audio.
4. Expand the Qwen evaluation set and reject incorrect lexical/teaching claims before considering removal of the experimental flag.
5. Test public-Pages→companion local-network permissions and phone/LAN transport separately before publishing those capabilities.

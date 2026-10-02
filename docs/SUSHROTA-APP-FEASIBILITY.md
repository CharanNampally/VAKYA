# Can Su-shrota power our browser, iOS, and Android Sanskrit tutor?

**Assessment date:** 2 October 2026  
**Decision:** Yes, as the Sanskrit recognition component. It cannot replace the LLM or speech synthesizer. Browser-local ASR is feasible enough to prototype, and was smoke-tested during this assessment. A production-quality, all-native-browser Sanskrit voice tutor is not established.

**Related:** [Model internals](./SUSHROTA-TECHNICAL-GUIDE.md) · [Repository map](./SUSHROTA-REPOSITORY-MAP.md) · [Current app README](../README.md)

> **Implementation update, 2 October 2026:** A subsequent task implemented and tested browser-local ONNX ASR in this app, with recording, upload, model caching, and a public sample. See the [current setup instructions](../README.md#local-setup). The assessment below describes the evidence and application state before that implementation; its mobile, TTS, quality, and licensing release gates still apply.

## 1. Direct answers

| Question | Answer |
|---|---|
| Can we reuse Su-shrota to recognize learners speaking Sanskrit? | Yes, subject to licensing review and evaluation on beginners/conversational speech. |
| Does it take recognized text and generate an answer? | No. It consumes audio and produces a transcript. Keep a separate tutor LLM. |
| Can Chrome capture the microphone? | Yes, on supported devices in a secure context, with permission. |
| Can Chrome's built-in recognizer be assumed to support Sanskrit? | No. A `sa-IN` tag is not a support guarantee. |
| Can we run this recognizer in the browser ourselves? | A community INT8 ONNX export already exists. We successfully ran one public sample in the integrated Chromium browser. |
| Can the browser play model-generated audio? | Yes. A standard audio element or Web Audio can play a supported audio response. |
| Can browser `speechSynthesis` load the Su-shrota/Vagdhenu weights? | No. It uses voices exposed by the device/browser. Custom neural inference is a separate path. |
| Can the linked dataset train the tutor response model? | Not as-is. It is audio/transcript supervision, not teaching dialogue or grammar-grounded instruction data. |
| Can the app remain account-free and database-free? | Yes. Keep per-session dialogue in memory and preferences/progress local. External inference still needs infrastructure or downloaded models. |
| Can the complete tutor be called offline? | Not with the current OpenAI response engine and server TTS. Local ASR alone does not make the full app offline. |

## 2. Resolve the overloaded word “model”

The required product has three separate inference jobs:

```text
1. Hear learner       2. Decide what to teach          3. Speak the response
----------------      ----------------------          --------------------
ASR                    Tutor LLM                       TTS
audio -> text          text + context -> text          text -> audio
```

For our existing architecture:

```text
Learner microphone
    |
    v
Su-shrota ASR
    | Devanagari transcript
    v
Transcript confirmation / uncertainty handling
    |
    v
OpenAI tutor + canonical lesson context + support language
    | { Sanskrit, transliteration, explanation }
    v
Sanskrit TTS / reviewed lesson audio
    | waveform
    v
Browser or native audio playback
```

The prior request explicitly selected OpenAI for teaching and excluded authentication/database features. Nothing in these new speech resources requires changing those decisions.

For a no-LLM **repeat-after-me** mode, a fixed reference, Su-shrota, and an alignment/scoring function are sufficient. For an open conversation that answers questions and adapts explanations, the LLM is still needed.

## 3. What “native browser capabilities” really means

### 3.1 Capture: suitable and reusable

Use browser capabilities for:

- Microphone permission and capture with `navigator.mediaDevices.getUserMedia`.
- Recording through `MediaRecorder`, or raw PCM capture through AudioWorklet.
- Downmixing/resampling with Web Audio or a validated resampler.
- Playback of reference/response audio.
- Caching model assets and static lesson audio.

Require HTTPS except during localhost development. Browser microphone access can also be controlled by embedding permissions. Start/resume capture and playback from user gestures where necessary.

Keep recording **push-to-talk** initially. Full-duplex speech brings echo, interruption, turn-detection, and concurrency problems that do not improve the first Sanskrit teaching release.

### 3.2 Native speech recognition: optional, not a Sanskrit foundation

`SpeechRecognition` / `webkitSpeechRecognition` accesses a browser-provided recognizer.

MDN documents that some implementations, including Chrome configurations, use a server-based recognition engine. The presence of a browser API does not imply local processing or zero third-party audio transfer. [B1]

Newer experimental APIs include:

- `processLocally`
- `SpeechRecognition.available(...)`
- `SpeechRecognition.install(...)`

Check feature availability and ask for the **specific language**, rather than assuming English support implies Sanskrit support. Installation only works for language packs that the implementation makes available. [B2]

These APIs do not provide a standard hook to install an arbitrary NeMo/ONNX model as Chrome's built-in recognizer.

**Recommendation:** native recognition can be an optional convenience for explanations/questions in a verified support language. Sanskrit learning audio should use our explicitly selected ASR, not be routed through Hindi because both languages can use Devanagari.

### 3.3 Native speech synthesis: useful but voice-dependent

`speechSynthesis.getVoices()` enumerates voices actually exposed by the current device/browser. Voice lists can arrive asynchronously; listen for `voiceschanged`. [B3]

Setting:

```js
utterance.lang = "sa-IN";
```

requests a language; it does not create or download a high-quality Sanskrit voice.

A Hindi voice may render Sanskrit text with unwanted pronunciation conventions. It should never be silently presented as a verified Sanskrit pronunciation teacher.

Appropriate uses:

- English/Hindi/Telugu support-language explanations **when matching voices exist**.
- A clearly labeled device-voice preview when its pronunciation has been evaluated.

For the Sanskrit teaching target, prefer reviewed audio or a Sanskrit-specific TTS service. Always keep a text transcript and replay control.

### 3.4 Playback is not synthesis

If a server produces WAV/MP3 audio, the browser only needs to play it:

```text
TTS service -> audio bytes -> Blob/object URL or streamed resource -> audio player
```

No Sanskrit system voice is required to play a WAV. This is the simplest way to provide listenable output consistently across platforms.

An autoplay rejection is a playback-policy problem, not proof that TTS failed. Show a visible Play button; surface errors, stop old playback on interruption, and revoke obsolete object URLs.

## 4. Important discovery: a community browser-local export

### 4.1 What exists

The original model metadata links a community project:

- [ONNX model repository](https://huggingface.co/gnumanth/sushrota-sanskrit-asr-onnx)
- [Browser demo source](https://huggingface.co/spaces/gnumanth/sushrota-sanskrit-asr-onnx)
- [Running demo](https://gnumanth-sushrota-sanskrit-asr-onnx.static.hf.space/)

This is **gnumanth's conversion**, not an official author-maintained browser release.

Its published files are:

| File | Verified repository byte size | Purpose |
|---|---:|---|
| `sushrota_sanskrit_ctc_int8.onnx` | 187,484,189 | Quantized ASR inference graph |
| `preprocessor.onnx` | 152,338 | Audio-to-mel feature preprocessing |
| `sanskrit_vocab.json` | 2,996 | Selected output-index-to-token mapping |

The model is about **187.5 MB decimal / 178.8 MiB**. The “~178 MB” displayed by the demo is effectively a binary-size label.

The conversion card claims approximately 115M active parameters and low CPU/WASM latency. Those parameter/performance claims were not independently reconstructed from the full graph here.

### 4.2 How its browser pipeline works

```text
Microphone recording / public sample / uploaded file
 -> browser audio decode
 -> OfflineAudioContext to 16 kHz mono Float32 PCM
 -> preprocessor.onnx
      input:  audio_signal [1, N], float32
              length [1], int64
      output: features, feature_lengths
 -> quantized ASR ONNX graph
      input:  audio_signal = features
              length = feature_lengths
      output: token scores, approximately [1, T, 257]
 -> frame-wise argmax
 -> CTC repeat collapse and blank removal
 -> vocabulary lookup
 -> Devanagari transcript
```

The demo uses **ONNX Runtime Web 1.21.0**, explicitly selects the **WASM execution provider**, and uses Cache Storage for the ASR model.

Its model card mentions WebGPU/CoreML, but the inspected browser implementation does not establish either execution path. INT8 graph/operator compatibility must be tested for the provider in question.

### 4.3 What was actually tested

One public sample was transcribed in the VS Code integrated browser, whose user agent reported:

```text
Chromium 150 / Electron 43.7.3, macOS
```

No user microphone recording or private file was sent to the public demo.

| Check | Observed result |
|---|---|
| Model initialization | Succeeded |
| Input sample | Public Suryanamaskara introduction |
| Audio duration reported by demo | 5.00 seconds |
| Preprocessing | 46 ms |
| ASR graph inference | 907 ms |
| Combined preprocessing/inference | 954 ms |
| Real-time factor | 0.191 |
| Cross-origin isolation | False |
| WASM threading | Runtime warned and fell back to single-threaded execution |
| Native Sanskrit local recognition pack | `available({langs:["sa-IN"], processLocally:true})` returned `unavailable` |
| Native Sanskrit synthesis voice | No matching `sa`/`sa-*` voice in enumerated voices at probe time |

The actual transcript was:

> सूर्यनमस्काराणां त्रीणिैवैशिष्ट्यानि

The visible output contains an unusual vowel-sign sequence. The demo's own IAST output also retained an untranslated Devanagari sign. These are reasons not to copy its text-conversion code as a production linguistic layer.

**What this proves:** the downloaded ONNX graphs can execute locally in this browser and produce Sanskrit text.

**What it does not prove:**

- Full benchmark accuracy or parity with v13b NeMo.
- Good recognition of beginner accents, short conversational replies, or mixed-language questions.
- Microphone quality on physical phones.
- Low-end Android or iOS memory/latency viability.
- Successful WebGPU execution.
- Offline cold-start behavior.
- TTS pronunciation quality or end-to-end LLM integration.

The reported 954 ms excludes first model download/initialization and tutor/TTS latency. It is not end-to-end turn latency.

### 4.4 Browser deployment work still needed

1. **Pinned assets:** host versioned model/runtime/vocabulary/preprocessor artifacts; do not depend on mutable `main` URLs for production.
2. **Accuracy parity:** compare ONNX and NeMo on the identical held-out audio and normalization.
3. **Worker execution:** run heavy inference outside the UI thread. A `setTimeout` is not a Web Worker.
4. **Memory budget:** account for download buffers, model compilation, tensors, and activations; 179 MiB on disk is not a 179 MiB runtime limit.
5. **Short inputs:** cap utterance duration; reject/segment rather than silently truncate.
6. **Loading UX:** show download size/progress, allow cancellation/retry, and request consent before large mobile downloads.
7. **Complete offline cache:** cache the app shell, runtime JS/WASM, vocabulary, preprocessing graph, and model. The demo's model cache alone is not a complete offline PWA.
8. **Threading:** use cross-origin isolation where compatible with deployment, or benchmark the single-thread fallback. ONNX Runtime documents this requirement. [B4]
9. **Provider selection:** begin with the tested WASM path; only enable WebGPU after operator and device qualification.
10. **Failure fallback:** offer typed input, explicit server ASR with consent, or retry. Do not silently send a private recording to another provider.
11. **Audio lifecycle:** clean up tracks, nodes, timers, and object URLs; cancel stale requests when a lesson changes.
12. **Privacy verification:** test network requests to confirm that local ASR does not upload audio. LLM transcript submission is a separate, disclosed transfer.

There is no export/quantization recipe or full accuracy comparison among the community model's five published files. Independently validate provenance and reproducibility rather than relying only on its README.

## 5. Candidate architectures

| Option | ASR | Tutor | Spoken Sanskrit | Assessment |
|---|---|---|---|---|
| A. Native browser speech only | Browser recognizer | OpenAI | Device voice | Fast prototype for supported languages; unreliable foundation for Sanskrit |
| B. Server speech pipeline | Hosted Su-shrota | OpenAI | Hosted Sanskrit TTS / reviewed audio | Most controllable cross-platform baseline; incurs hosting and audio transfer |
| C. Browser-local ASR hybrid | Community ONNX or our validated export | OpenAI | Hosted Sanskrit TTS / reviewed audio | **Recommended web prototype**; less ASR hosting, large first download |
| D. Fully local tutor | Local ASR | Separate local instruction model | Separate local TTS | Not delivered by these artifacts; much larger scope and device burden |
| E. Fixed reference practice | Local/server ASR | No LLM required | Pre-generated/reference audio | Strong low-cost mode; cannot answer arbitrary learner questions |

### Recommended strategy

Build **C with B as an explicit fallback**, and include **E** for guided drills.

Do not force users to download a large ASR model to view lessons or type a reply. Offer “Recognize on this device” as a capability-gated feature, with a clear first-download cost.

On native mobile, use the server baseline initially. A later ONNX Runtime native integration can be evaluated separately; Expo's shared React UI does not automatically share browser WASM execution.

## 6. Spoken responses: what we should actually use

### 6.1 Fixed curriculum phrases

Pre-generate and have a Sanskrit expert review common greetings, drills, minimal pairs, and example sentences. Ship or cache their audio.

Advantages:

- Instant replay.
- No per-replay synthesis request.
- Consistent pronunciation.
- Works for downloaded lessons.
- Keeps inaccurate dynamic TTS from becoming the learner's reference.

Vagdhenu is a candidate for chant material. It needs evaluation on natural conversational phrases before being used as the voice of the dialogue tutor.

### 6.2 Dynamic tutor Sanskrit

Send only the validated Sanskrit response text to the TTS service. Return a playable audio response or resource.

A sample application-level contract could be:

```json
{
  "sanskrit": "अहं पठामि। भवान् किं करोति?",
  "transliteration": "ahaṃ paṭhāmi. bhavān kiṃ karoti?",
  "support": "I am reading. What are you doing?",
  "audio": {
    "status": "ready",
    "url": "/api/audio/short-lived-resource",
    "language": "sa",
    "style": "conversation"
  }
}
```

This is a **proposed contract**, not an endpoint already implemented in the app. The spoken style must accurately describe the actual voice; do not label chant output “conversation.”

If synthesis fails, preserve the tutor text, report audio as unavailable, and offer retry. Do not report success with empty audio or silently choose a Hindi voice.

### 6.3 Support-language explanations

Speak explanations separately in the learner's selected support language using a verified device voice or a suitable TTS provider.

Do not feed a mixed Sanskrit-plus-English paragraph through one guessed voice. Maintain segment boundaries and language labels.

The product model remains:

```text
targetLanguage        = sa
conversationLanguage  = sa, unless learner intentionally asks otherwise
supportLanguage       = en / hi / te / future additions
displayScript         = Devanagari / IAST / supported regional script
```

## 7. Fit with the current Expo app

The current workspace already separates transcription from tutoring:

| Existing surface | Current behavior | Proposed adaptation |
|---|---|---|
| [App.tsx](../App.tsx) lesson screen | Records with Expo Audio, sends transcript to tutor, calls Expo Speech for Sanskrit | Introduce explicit recording/transcribing/thinking/speaking states and selectable speech backend |
| [src/api.ts](../src/api.ts) | Sends audio to `/api/transcribe`; text to `/api/tutor` | Add web-local recognizer adapter; keep server ASR for unsupported devices |
| [api/transcribe.ts](../api/transcribe.ts) | Calls OpenAI transcription | Route to a long-lived Su-shrota service when server ASR is selected |
| [api/tutor.ts](../api/tutor.ts) | OpenAI chat response with Sanskrit, IAST, and support text | Keep OpenAI; provide actual canonical lesson content and validated structured output |
| [src/content.ts](../src/content.ts) | Canonical Sanskrit examples plus localized meanings | Add reviewed reference audio and reference text IDs |
| [src/types.ts](../src/types.ts) | Learner preferences and tutor messages | Represent ASR engine/version, uncertainty, and audio availability distinctly |

### 7.1 Gaps relevant to a real voice implementation

The previous passing UI tests did not establish successful real microphone-to-model-to-audio behavior.

Specific integration issues visible in the source:

- The browser audio upload helper appends a React Native `{uri, name, type}` object cast to `Blob`. A browser needs an actual Blob/File; a TypeScript cast does not convert the recording.
- Recognition upload currently assumes `.m4a` / `audio/mp4`. Actual browser recording containers must be inspected and decoded correctly.
- `Speech.speak(..., { language: "sa-IN" })` does not check that a Sanskrit voice exists or meets teaching quality.
- Permission and recorder setup failures need user-visible error handling and lifecycle cleanup.
- Lesson context sent to the LLM currently identifies the lesson by ID, not the complete curated examples/objective.
- Voice inference, codec handling, transcript quality, and pronunciation output need tests distinct from navigation/completion tests.

This assessment does **not** change application code or claim that these gaps are fixed.

### 7.2 No authentication or database required

For the requested scope:

- Store settings/progress locally.
- Hold a bounded conversation history in memory.
- Send necessary recent turns to the LLM per request.
- Keep API credentials on the server.
- Do not retain recordings by default.
- Do not adopt the upstream training-data collection pipeline.

Anonymous public endpoints still need cost controls: input limits, timeouts, concurrency limits, quotas/rate limits, and operational monitoring. “No login” does not mean “unbounded provider spending.”

If training collection is added later, use a separate explicit opt-in and published retention policy. That would be an additional product requirement, not part of this stateless MVP.

## 8. Reference verification versus open conversation

Use different feedback policies for these two modes.

### Known-reference drill

The app knows what the learner was asked to say. Compare the ASR transcript with that reference, show uncertainty, and allow hearing both recordings.

Borrow the upstream ideas:

- Keep Sanskrit canonical internally.
- Ignore irrelevant script/spacing differences for matching.
- Use an uncertainty band instead of always declaring an error.
- Let learners correct the transcript.
- Keep conservative grading until expert-labeled evaluation supports stronger claims.

Do **not** claim acoustic precision merely because a transcript matches. ASR can normalize a mistake into the expected word. Also count insertions if the learning objective requires an exact repetition.

### Open conversation

There is no single correct reference. Transcription must not be coerced into the expected lesson phrase.

Recommended flow:

1. Capture a short utterance.
2. Show recognized Sanskrit; make editing/retry available.
3. When audio or recognition is uncertain, ask for repetition/confirmation.
4. Send confirmed text to the tutor.
5. Keep grammar/content feedback separate from acoustic feedback.

The text-only LLM cannot inspect vowel duration or aspiration in the original audio unless an explicit audio analysis signal is also provided. It should not invent pronunciation diagnoses from a possibly mistaken transcript.

## 9. Web, iOS, and Android considerations

| Surface | Recommended initial path | Additional validation |
|---|---|---|
| Desktop Chrome | Browser capture + local ONNX when initialized, server fallback | RAM, cold download, workers, threading, noise, microphone interruption |
| Android Chrome | Same, capability-gated | Low-memory phones, thermal throttling, cache eviction, backgrounding |
| iOS Safari/PWA | Server ASR initially; local ONNX only after direct testing | WebKit memory limits, AudioContext/autoplay policy, codec support, resume behavior |
| Native Expo iOS | Expo Audio capture -> server ASR -> tutor -> audio playback | Permissions, audio session categories, Bluetooth, interruptions |
| Native Expo Android | Same server baseline | Codec/container details, permission flow, device TTS availability |
| Later native on-device option | Validated ONNX Runtime native integration | Native module/build integration, preprocessing parity, model distribution, device benchmarks |

Web Speech APIs are web APIs, not automatic APIs inside a React Native JavaScript runtime. A WebView wrapper also does not guarantee identical permissions, memory, microphone, or speech behavior.

App Store/Play distribution, developer accounts, signing, and review remain separate from speech-model feasibility.

## 10. Deployment and operating cost

### Browser-local ASR

Per-recognition ASR compute runs on the learner's device, but costs remain:

- Model download bandwidth.
- Asset hosting.
- OpenAI text generation.
- Dynamic TTS hosting/inference.
- Monitoring and maintenance.

Theoretical first-download times for 187.5 MB, before protocol overhead:

| Throughput | Approximate lower bound |
|---|---:|
| 10 Mbit/s | 150 seconds |
| 50 Mbit/s | 30 seconds |
| 100 Mbit/s | 15 seconds |

Cache reuse helps but is not guaranteed forever; browsers can evict storage.

### Server ASR/TTS

Deploy the web UI and lightweight orchestration separately from model workers:

```text
Static frontend/CDN
    + small stateless tutor API
    + long-lived ASR worker, CPU or GPU after benchmarking
    + long-lived TTS worker, likely GPU for the inspected Vagdhenu path
    + optional cache of nonpersonal, reusable reference audio
```

Do not assume an ordinary short-lived JavaScript function is a suitable host for a NeMo/PyTorch stack or a large DiT/vocoder pair. Deployment limits and cold starts need to be measured on the chosen platform.

The existing app has a Vercel deployment configuration, but deployment credentials, live OpenAI connectivity, and native builds were not validated by this research.

End-to-end turn latency is approximately:

```text
capture completion
 + audio decoding/resampling
 + ASR
 + network/orchestration
 + LLM response generation
 + TTS generation
 + playback startup
```

A fast ASR-only benchmark does not erase the other terms.

## 11. Evaluation plan before shipping

These are **proposed acceptance gates**, not measured achievements or user-approved release requirements.

### Stage 1: correctness and parity

- Evaluate v13b NeMo and ONNX on the same 327 public held-out examples.
- Match sampling rate, padding policy, normalization, and tokenizer.
- Report micro CER, raw WER, and the exact SN-WER variants.
- Report per-clip failures, silence hallucinations, and throughput.
- Suggested starting gate: ONNX CER no more than 0.5 percentage points worse than NeMo on the fixed split, plus review of changed transcripts.
- Treat short-utterance precision separately from corpus-average CER.

The existing 327-clip set is not enough by itself: it is clean-tier reference-reading data with repeated texts and unavailable public speaker IDs.

### Stage 2: actual learner distribution

Create an explicitly consented, expert-transcribed evaluation set covering:

- Beginners from different native-language backgrounds.
- Male/female and age diversity appropriate to the audience.
- Short greetings, names, numbers, question forms, and conversational repairs.
- Aspirated/unaspirated, retroflex/dental, short/long vowel contrasts.
- Phones, laptops, headphones, quiet rooms, and moderate background noise.
- Script choices independently of the spoken language.
- Code-switching and support-language questions as separate categories.

Split by verified speaker and, where testing generalization, by text/lesson. Do not recycle evaluation recordings into training.

For grading, collect expert judgments about the **audio**, not just a corrected ASR draft. Measure false accusations, missed mistakes, and abstention coverage separately. A tentative target such as no more than 2% false accusations on expert-confirmed correct attempts requires sufficient data and uncertainty intervals.

### Stage 3: voice quality

Have Sanskrit experts and representative learners evaluate:

- Schwa preservation.
- Vowel quantity.
- Aspiration and retroflex contrasts.
- Visarga and anusvara.
- Conjunct handling.
- Onset/tail omissions.
- Naturalness in conversational versus chant contexts.
- Tempo changes without degrading segment identity.

Do not use the same ASR model as the sole judge of its companion TTS. Correlated model errors can mask pronunciation failures.

### Stage 4: device/end-to-end reliability

Measure physical-device p50/p95 latency, peak memory, battery/thermal effects, and cold/warm startup.

Test:

- Permission denied/revoked.
- Silence and low-volume recording.
- Unsupported container.
- Recording stopped early or capped.
- Navigation during transcription.
- Lost network and unavailable provider.
- Model download interruption/corrupt cache.
- Tab backgrounding or phone interruption.
- TTS playback refusal.
- Repeated turns without leaked tracks/tensors.

Suggested UX target for local ASR: p95 under two seconds after stopping a five-second recording on specifically qualified devices. Devices that fail that gate should use a clearly disclosed alternative, not be falsely advertised as supported.

## 12. Implementation sequence

1. **Resolve reuse terms.** Confirm code, weight, conversion, and voice permissions.
2. **Make the current voice path real.** Correct web/native audio handling, explicit state transitions, and voice availability/error handling.
3. **Prototype local web ASR.** Pin the ONNX assets and use a worker; show first-download choice and transcript confirmation.
4. **Keep the OpenAI tutor.** Supply canonical lesson examples and bounded history; validate response shape.
5. **Add reviewed reference audio.** This supplies reliable listening immediately.
6. **Qualify dynamic Sanskrit TTS.** Benchmark Vagdhenu for chant and conversational material separately.
7. **Add server ASR fallback.** Load one model per worker, bound requests, keep recordings ephemeral.
8. **Run parity, learner, and physical-device evaluations.**
9. **Deploy web, then native mobile.** Use measured capability gates; do not block the whole product on fully local mobile speech.

The important product decision is not “Chrome or AI.” It is **which stages run locally, which require a service, and what happens when a stage is uncertain or unavailable**.

## 13. Bottom line

**Yes: these resources can materially improve the app we wanted.**

The strongest supported design is:

> Browser/native microphone capture -> validated Su-shrota ASR -> OpenAI Sanskrit tutor -> reviewed audio or qualified Sanskrit TTS -> browser/native playback.

The new community ONNX export makes **browser-local Sanskrit transcription a concrete option**, not merely a future conversion project.

However:

- It is not Chrome's built-in Sanskrit speech support.
- ASR is not a tutor or voice generator.
- The current smoke test is not a quality certification.
- A conversational Sanskrit voice remains a separate quality/deployment problem.
- Licensing and learner-distribution evaluation remain release gates.

No auth, login, or database is inherently required for this architecture.

## 14. Sources and scope

- **[B1]** [MDN SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition); [inspectable MDN source](https://github.com/mdn/content/blob/main/files/en-us/web/api/speechrecognition/index.md).
- **[B2]** [MDN language availability and on-device recognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/available_static).
- **[B3]** [MDN getVoices](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis/getVoices).
- **[B4]** [ONNX Runtime Web environment flags and threading](https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html); [deployment requirements](https://onnxruntime.ai/docs/tutorials/web/deploy.html).
- **[B5]** [Pinned community ONNX model](https://huggingface.co/gnumanth/sushrota-sanskrit-asr-onnx/tree/d320b7aada7f844b2c78d4f6c935aba77d0327a0).
- **[B6]** [Pinned demo implementation](https://huggingface.co/spaces/gnumanth/sushrota-sanskrit-asr-onnx/blob/804caecb94b33974fd379b2724dbc87b47888f99/index.html).
- **[B7]** [Vagdhenu model and limitations](https://huggingface.co/prathoshap/vagdhenu).
- **[B8]** [Official ASR sources and checkpoint evidence](./SUSHROTA-TECHNICAL-GUIDE.md#15-sources).

The attached conversation-history export was checked locally for relevant user requirements. No user messages directly mentioning Sanskrit/Su-shrota were found; unrelated conversation contents were not used in this assessment or sent to external research services.

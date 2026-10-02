# Hosted Sanskrit tutor

Anonymous, bounded HTTPS API for the Expo client. This is separate from the
loopback companion and from the Vāgdhenu speech container.

## Models and routing

`VAKYA_TRANSLATION_PROVIDER` selects `madlad` (default) or `indictrans2`. Selection
is explicit: provider failures do not trigger an unannounced fallback.

- MADLAD: `google/madlad400-3b-mt`, Apache-2.0, revision
  `fa184c675da0b5c9e1c8694fccd4e12e2d422094`. English/Hindi/Telugu/Sanskrit tags
  were checked against the actual tokenizer. Real translation quality must be
  evaluated separately; this is not a correctness engine.
- Qwen: `Qwen/Qwen3-4B`, Apache-2.0, revision
  `1cfa9a7208912126459214e8b04321603b3df60c`. English conversational planning,
  not translation or grammar validation.
- IndicTrans2: existing pinned directional adapters in the companion. Switching
  requires normally authorized model provisioning and a mounted `VAKYA_MODEL_DIR`
  containing the companion's revision directories and readiness markers.
  The default image does not contain gated IndicTrans2 weights.
- Analysis: the existing local Sanskrit morphology provider, not sentence-level
  grammar verification.

Teach translates directly into Sanskrit. Converse translates input to English,
generates a bounded English reply/tip with Qwen, then translates the reply into
Sanskrit and the tip into the selected support language. English history is
returned to the client and supplied with subsequent requests; it is not stored
server-side.

## Runtime

Build from the repository root:

```sh
az acr build --registry crvakyattsnc --image vakya-tutor:TAG \
  --file azure/tutor/Dockerfile .
```

The root Docker ignore file is an allowlist: local credentials, `.env` files,
pairing tokens, and local model caches are excluded. Pinned public weights are
baked into the image. Inference is offline and needs no Hugging Face token.

Use the existing T4 workload profile, 8 CPU / 56 GiB, one worker, minimum zero
and maximum one replica. Models remain in CPU RAM between stages; one model at
a time moves to GPU. MADLAD uses FP32 to avoid T5 FP16 overflow.

Required environment:

- `AZURE_STORAGE_TABLE_ENDPOINT`: existing Azure Table endpoint
- `VAKYA_QUOTA_TABLE`: default `VakyaTutorQuota`
- `VAKYA_GLOBAL_DAILY_LIMIT`: default 100, positive
- `VAKYA_CLIENT_DAILY_LIMIT`: default 20, positive
- `VAKYA_TRANSLATION_PROVIDER`: `madlad` or `indictrans2`
- `VAKYA_TTS_API_URL`: optional separate speech origin, for capability reporting

Assign a managed identity with `AcrPull` on the registry and `Storage Table Data
Contributor` on the quota storage account. No shared API key goes in the client.
The anonymous API is not protected by CORS against non-browser callers. Atomic
global quotas bound inference requests; per-client quotas are best-effort.
Quotas do not bound all Azure billing (image storage, cold starts, or network
traffic), so configure Azure budget alerts independently.

## Contract and frontend

- `GET /health`: process health, not a completed model inference.
- `GET /v1/capabilities`: installed providers; does not reserve quota.
- `POST /v1/teach`, `/v1/analyze`, `/v1/converse`: companion-compatible JSON.
- Errors: `{ "error": { "code": "...", "message": "..." } }`.
- 16 KiB JSON body, 400-character input, six history entries, one active request.
- `429`: busy or quota exhausted. `503`: missing provider/infrastructure failure.
- No request bodies or conversations in application logs.

Set public build variable `EXPO_PUBLIC_TUTOR_API_URL` to the HTTPS origin.
Hosted builds auto-connect without pairing; `?service=local` explicitly opts
into the original loopback mode. `EXPO_PUBLIC_TTS_API_URL` remains the separate
speech origin. Existing OpenAI endpoints are used only when hosted mode is not
configured.

## Validation

```sh
PYTHONPATH=azure/tutor:companion companion/.venv/bin/python -m pytest azure/tutor/test_hosted.py
npm test -- tests/unit/hosted-tutor.test.ts tests/unit/local-tutor.test.ts
```

Fixture tests cover contracts and errors, not translation quality or actual GPU
inference. Deployment is not accepted until real translation, conversation and
audio playback have been exercised through the public client.

Run the opt-in public-browser test against a deployed hosted build:

```sh
HOSTED_LIVE_URL=https://charannampally.github.io/VAKYA/ \
  npm run test:e2e -- tests/e2e/hosted-live.spec.ts --project desktop-chromium
```

It consumes real quota, checks the returned Sanskrit/Telugu scripts and WAV
header, and observes actual browser audio time advancing (without stubbing
playback). These are integration checks, not expert linguistic evaluation.

## Measured runtime evidence and quality limits

The pinned `.4` image adds the actual T5 tokenizer's required Protobuf
dependency and schema-constrained Qwen JSON generation. Both tokenizers are
loaded during its build. The deployment manifest pins its immutable digest.
The patch Dockerfile reuses the large, already published model layers; the main
Dockerfile remains the from-source build recipe.

Real Azure inference returned:

- English `Hello` -> Sanskrit `namaskarah` (IAST display uses diacritics).
- Hindi and Telugu greetings -> Devanagari Sanskrit greetings.
- Sanskrit morphology returned real candidate roots/tags.
- English-to-Sanskrit Teach: approximately 21 seconds on the warm service's
  first model load; conversation with Telugu support: approximately 37 seconds.

**Quality gate not passed:** "I read a book." produced `aham pustakam
pathishyami`, changing the present tense into future tense. A conversational
reply also contained unnatural/mixed-language Sanskrit. These concrete failures
mean the current translator must remain experimental, not verified teaching.
Constrained JSON fixes structure, not linguistic correctness. Switching to
normally authorized IndicTrans2 and comparative expert evaluation remain open.
Azure Translator's advertised language list was also checked: it did not
advertise Sanskrit, so it was not added as a misleading substitute.

Scale-to-zero cold starts took roughly three minutes in one measurement and
also produced dropped connections during later image activation. One replica
was temporarily kept warm with the owner's approval for verification, with
restoration to zero scheduled within 20 minutes. This is a real availability
limitation, not evidence of an always-responsive production service.

The actual public-browser integration test subsequently **passed** in 51 seconds:
Pages auto-connected without pairing, translated English input, received a real
WAV blob, advanced browser audio playback beyond 0.15 seconds, and returned a
Qwen/MADLAD conversation with a Telugu explanation. Audio and inference were not
stubbed. Separately, the deployed Pages test loaded the real local ASR worker and
returned the exact sample transcript with no audio POST requests. These results
establish the operational pipeline, not translation correctness.

The tutor's minimum replicas was restored to **0**, maximum **1**, and the
resulting Azure configuration was read back successfully. Public entry point:
<https://charannampally.github.io/VAKYA/?mode=tutor&lang=en>.

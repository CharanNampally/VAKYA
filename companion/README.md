# Vākya local companion

The [architecture](../docs/LOCAL-COMPANION-ARCHITECTURE.md) distinguishes the target stack from activated providers. This service is separate from GitHub Pages and binds only to `127.0.0.1:8765`. It has no cloud inference fallback.

## Install

Use Python 3.11 in an isolated environment (the system Python on macOS may be too old):

```sh
python3.11 -m venv companion/.venv
companion/.venv/bin/python -m pip install -e 'companion[test]'
```

Core installation provides pairing, capability reporting, validation, and real Devanagari→IAST transliteration. It does **not** install neural model weights.

The tested Python 3.11/Apple Silicon versions are recorded in [requirements-lock.txt](requirements-lock.txt). To constrain a new install to these versions, add `-c companion/requirements-lock.txt` to the pip command. MLX is an Apple Silicon-only optional dependency, not a portable Linux conversation runtime.

Optional packages:

```sh
companion/.venv/bin/python -m pip install -e 'companion[translation,grammar,test]'
# Apple Silicon only: local MLX Qwen provider
companion/.venv/bin/python -m pip install -e 'companion[conversation]'
```

Do not install Parler into this environment: upstream currently pins Transformers 4.46.1, conflicting with the translation/Qwen runtime. The speech endpoint returns an explicit unavailable response until an isolated TTS worker is activated.

## Approve and provision models

Approve the requested access terms on the three IndicTrans2 model pages linked in the [architecture](../docs/LOCAL-COMPANION-ARCHITECTURE.md#4-model-provenance-and-provisioning). The MIT model metadata does not bypass Hugging Face access approval.

```sh
companion/.venv/bin/python -m pip install -e 'companion[provision]'
companion/.venv/bin/hf auth login
companion/.venv/bin/vakya-models en-indic
companion/.venv/bin/vakya-models indic-en
companion/.venv/bin/vakya-models indic-indic
# Apple Silicon conversation provider; downloads several GB
companion/.venv/bin/vakya-models qwen
```

Enter Hugging Face credentials in your own terminal, never in chat or the web app. Provisioning is the only phase that contacts the model hub. It pins revisions and downloads safetensors rather than pickle weights. Serving sets the Hugging Face/Transformers offline flags. Model files live under ignored `companion/models/` by default; set `VAKYA_MODEL_DIR` before both provisioning and serving to use another location.

## Run and pair

```sh
companion/.venv/bin/vakya-companion
```

In a separate local terminal:

```sh
companion/.venv/bin/vakya-companion --show-token
```

Copy that token into **http://localhost:19006/?mode=tutor&lang=en** after starting `npm run web`. The token is stored in an owner-only file under ignored `companion/.state/`; the frontend retains it only in memory. Do not put it in a link. Refreshing the page requires pairing again.

GitHub Pages can call the companion only if the browser permits loopback/private-network access. Approved origins are the local Expo server and `https://charannampally.github.io`; use the localhost app if the browser blocks the public-origin connection. Do not disable browser security or bind the service to `0.0.0.0`.

A native phone's loopback address is the phone itself, not this computer. The native UI explains this limit; LAN pairing is not implemented.

### Current development-machine status

The service, actual Sanskrit→IAST, and actual local word analysis are working. MLX Qwen has been downloaded and its English JSON planner tested, but the full conversation pipeline is not available without translation weights. IndicTrans2 activation remains access-blocked, and Parler synthesis is not activated. See the architecture's [measured results](../docs/LOCAL-COMPANION-ARCHITECTURE.md#13-implementation-evidence).

To try the working path, pair, choose **Sanskrit** as the input language, and run **Teach** for transliteration or **Word analysis** for lexical candidates. English/Hindi/Telugu translation controls remain unavailable until their providers are installed.

## Operations and limitations

- **Teach:** English→Sanskrit requires `en-indic`; Hindi/Telugu→Sanskrit requires `indic-indic`. Selecting Sanskrit performs normalization/IAST only, clearly labelled.
- **Word analysis:** optional `sanskrit_parser` lexical candidates for pre-separated words, up to 24 words and 12 candidates each. This is not full sentence parsing, sandhi disambiguation, or a correctness verdict. Roots/tags retain upstream Sanskrit notation.
- **Converse:** requires all three translation directions plus MLX Qwen and `VAKYA_EXPERIMENTAL_CONVERSATION=1` when starting the companion. It uses a bounded English-pivot history and validates model JSON. Real evaluation found a Hindi-as-Sanskrit error, so this is explicitly experimental and off by default, even with all weights installed. No automatic OpenAI fallback.
- **Speech:** explicitly unavailable pending a compatible isolated Parler worker and real audio evaluation. The existing browser Su-shrota panel is ASR only.
- One model operation runs at a time. Cancel stops browser waiting, not necessarily a synchronous model kernel. Wait for that kernel to finish before retrying.
- Neural output is not expert-reviewed Sanskrit. No pronunciation scores are generated.

## Tests

```sh
companion/.venv/bin/python -m pytest companion/tests -q
npm run test:e2e -- tests/e2e/local-tutor.spec.ts
```

Backend tests exercise actual HTTP guards, request schemas, deterministic transliteration, missing-provider behavior, and concurrency. Conversation orchestration and frontend neural outputs use explicitly labelled fixtures; they are not evidence of neural-model accuracy.

With the companion running and the grammar extra installed, exercise real browser pairing, actual IAST, and actual morphology:

```sh
COMPANION_LIVE_TEST=1 npm run test:e2e -- tests/e2e/local-tutor.spec.ts --project=desktop-chromium
```

The live test reads the ignored local pairing token internally and disables Playwright traces so credentials are not captured in a trace artifact.

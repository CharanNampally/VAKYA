# Vākya

Vākya is a stateless, voice-first Sanskrit tutor for web, iOS, and Android. Sanskrit content stays canonical while explanations are localized independently in English, Hindi, and Telugu.

## Speech model research

- [Su-shrota technical guide](docs/SUSHROTA-TECHNICAL-GUIDE.md): architecture, training, data, decoding, evaluation, and implementation caveats.
- [Browser and mobile feasibility](docs/SUSHROTA-APP-FEASIBILITY.md): native browser speech versus local ONNX, measured browser smoke test, TTS options, and integration roadmap.
- [Complete upstream repository map](docs/SUSHROTA-REPOSITORY-MAP.md): all 121 tracked files in the inspected snapshot.

The web app now includes browser-local Su-shrota ONNX transcription. Native builds retain the existing server transcription path. OpenAI still powers tutor replies; device speech is not a verified Sanskrit pronunciation voice.

## Features

- Guided onboarding for support language, Sanskrit script, and level
- Four seeded beginner lesson paths with Devanagari and IAST
- OpenAI-powered conversational Sanskrit tutor
- Browser-local Sanskrit transcription with microphone, upload, and public-sample controls
- Explicit 179 MiB model download, browser caching, cancellation, and editable transcripts
- Spoken tutor responses using device text-to-speech
- Local-only progress and preferences; no account or database
- Responsive Expo app shared across web, iOS, and Android

## Interface languages and share links

The language selector at the top is available throughout onboarding, lessons, practice, progress, settings, and standalone transcription. English, Hindi, and Telugu translations are bundled with the app: switching is immediate and needs no translation service, network request, or model download. Sanskrit lesson text, transcripts, and IAST remain Sanskrit.

Web links can select the support language:

| Language | App | Transcription |
| --- | --- | --- |
| English | `/?lang=en` | `/?mode=transcribe&lang=en` |
| Hindi | `/?lang=hi` | `/?mode=transcribe&lang=hi` |
| Telugu | `/?lang=te` | `/?mode=transcribe&lang=te` |

For example: **http://localhost:19006/?mode=transcribe&lang=te**. On a deployed site, use the same parameters with its public origin; localhost links only work on the computer running the app.

The first visit defaults to English, regardless of browser language. A supported `lang` parameter overrides the saved selection; without one the saved selection is restored, even before onboarding is complete. Regional tags such as `te-IN` normalize to `te`. Unsupported values emit a console warning and use the saved language or English. Changing language updates the URL without reloading and preserves other parameters and fragments, so copying the address shares the selected language. Share links do not include personal progress or chat history.

Switching preserves current lesson input, progress, and the loaded ASR worker. Static explanations and error messages change immediately. New tutor requests use the current support language. Already-generated AI replies are retained verbatim and marked when their language differs; they are not silently regenerated or sent for translation. Browser-owned controls (file dialogs, audio playback controls, permission prompts) follow the browser/OS language.

This release supports these **three languages**, not every world language. To add a language, extend the support-language type, language names, all UI and speech dictionaries, curriculum translations, level labels, and server tutor-language mapping, then run translation-completeness and end-to-end tests. No third-party translation source is downloaded at runtime.

## Local setup

1. Install dependencies with `npm install`.
2. Run `npm run web`.
3. Open **http://localhost:19006/?mode=transcribe** for transcription without onboarding, an account, or an API key.
4. Choose **Download speech model**, then **Try public sample**, **Record Sanskrit**, or **Upload audio**.

The first download is approximately 179 MiB from Hugging Face. Recognition runs in a Web Worker using the pinned community conversion of Su-shrota v13b and ONNX Runtime Web 1.21.0, single-threaded WASM. Audio is decoded to mono 16 kHz locally; no recording is uploaded to an ASR service. Model files are cached when browser storage is available, and the main model's SHA-256 is checked before loading. Cache eviction or a different browser/origin can require another download.

Use clips between 0.4 and 15 seconds, at most 10 MB. Microphone capture stops just before 15 seconds to allow codec finalization. Microphone access needs permission and HTTPS or localhost. Unsupported codecs, silence, missing assets, and inference failures are reported visibly. The public sample's source and CC-BY-4.0 attribution are in [ATTRIBUTION.txt](public/audio/ATTRIBUTION.txt).

Transcription is also available under **Practice** and inside lessons. **Use in tutor reply** only copies the editable transcript into the reply field. **Send** is the separate action that shares text with the tutor.

### Tutor API and mobile

Expo's local web server serves the app and recognition assets, **not** the functions in `api/`. For live tutor responses, deploy/configure that API with `OPENAI_API_KEY` on the server and set `EXPO_PUBLIC_API_URL` to its origin before starting the app. OpenAI credentials are not required for local ASR.

For native builds, run `npm run ios` or `npm run android` with the deployed API origin configured. The browser-only ONNX worker is not used in native builds.

The OpenAI key belongs only in the server deployment environment. Never expose it through an `EXPO_PUBLIC_` variable.

## Validation

```sh
npm run typecheck
npm test
npm run test:e2e
npm run export:web
```

The end-to-end suite uses actual ONNX inference on a public Sanskrit clip, verifies upload and simulated microphone input, and checks that recognition sends no POST requests. It also reloads with Hugging Face requests blocked to verify cached-model reuse. The real-model test runs only in desktop Chromium to avoid duplicate large downloads; mobile-viewport tests cover UI/error handling, not physical-phone performance. First-run tests require internet access and may take several minutes.

`npm run web`, `npm start`, and `npm run export:web` automatically prepare the pinned runtime files. If invoking Expo directly, run `npm run prepare:asr` first. These generated runtime files are excluded from version control; the model weights are fetched on demand, not committed.

## Deployment

### GitHub Pages

Public site: **https://charannampally.github.io/VAKYA/**

- English: `https://charannampally.github.io/VAKYA/?lang=en`
- Telugu transcription: `https://charannampally.github.io/VAKYA/?mode=transcribe&lang=te`
- Hindi transcription: `https://charannampally.github.io/VAKYA/?mode=transcribe&lang=hi`

The [Pages workflow](.github/workflows/pages.yml) checks types, runs unit tests, exports the web app, and deploys it on each push to `main`. Repository **Settings → Pages → Build and deployment → Source** must be **GitHub Actions**. The workflow sets `EXPO_PUBLIC_BASE_PATH=/VAKYA`, configuring both Expo's bundled-resource prefix and the local speech worker/sample paths. Leave that variable empty for normal localhost or root-domain hosting.

To verify the actual deployment, including real local inference:

```sh
PAGES_TEST_URL=https://charannampally.github.io/VAKYA/ npm run test:e2e -- tests/e2e/pages.spec.ts --project=desktop-chromium
```

GitHub Pages is static hosting: onboarding, curriculum, localization, device speech, saved progress, and browser-local ASR work there. **It cannot execute `api/tutor.ts` or `api/transcribe.ts`.** AI replies and the native server-transcription path still need a separate backend. Before enabling that backend from Pages, configure its allowed-origin/CORS policy for the Pages origin and provide its public URL at build time. Never add an OpenAI API key to the workflow or any `EXPO_PUBLIC_` setting.

The app's MIT license does not relicense third-party datasets, model weights, or runtime dependencies. Their attribution and release caveats below still apply.

### Web and API

Deploy the repository to Vercel and configure `OPENAI_API_KEY`. `vercel.json` exports the Expo web app and deploys the functions in `api/`.

### iOS and Android

Configure the deployed origin as the EAS environment variable `EXPO_PUBLIC_API_URL`, then:

```sh
npx eas-cli build --platform all --profile production
npx eas-cli submit --platform ios --profile production
npx eas-cli submit --platform android --profile production
```

Apple Developer and Google Play Console memberships are required for store submission.

## Model attribution and release caveat

ASR: [Prathosh A P / IISc Su-shrota](https://huggingface.co/prathoshap/sushrota-sanskrit-asr).
Browser conversion: [gnumanth's ONNX v13b export](https://huggingface.co/gnumanth/sushrota-sanskrit-asr-onnx/tree/d320b7aada7f844b2c78d4f6c935aba77d0327a0).

This is a local working integration, not a certification of recognition or pronunciation accuracy. The [technical guide](docs/SUSHROTA-TECHNICAL-GUIDE.md#12-running-and-reproducing-the-work) records upstream license/provenance questions to resolve before public redistribution or a commercial launch. The app does not copy the upstream practice service or collect learner recordings for training.

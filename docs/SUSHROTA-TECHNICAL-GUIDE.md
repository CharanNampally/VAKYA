# Su-shrota: technical deconstruction

**Research date:** 2 October 2026  
**Audience:** engineers, product builders, and technically curious Sanskrit educators  
**Companion:** [Browser and mobile app feasibility](./SUSHROTA-APP-FEASIBILITY.md)  
**Complete file map:** [Repository inventory](./SUSHROTA-REPOSITORY-MAP.md)

## Reading guide

1. [What these resources actually provide](#1-what-these-resources-actually-provide)
2. [Evidence, versions, and limits](#2-evidence-versions-and-limits)
3. [Architecture inside the checkpoint](#3-architecture-inside-the-checkpoint)
4. [From microphone samples to Sanskrit text](#4-from-microphone-samples-to-sanskrit-text)
5. [How the model is trained](#5-how-the-model-is-trained)
6. [Dataset construction and the feedback loop](#6-dataset-construction-and-the-feedback-loop)
7. [What the evaluation numbers mean](#7-what-the-evaluation-numbers-mean)
8. [Experiments and lessons learned](#8-experiments-and-lessons-learned)
9. [How the chant-practice application works](#9-how-the-chant-practice-application-works)
10. [How the dictation application works](#10-how-the-dictation-application-works)
11. [The separate speech-generation model](#11-the-separate-speech-generation-model)
12. [Running and reproducing the work](#12-running-and-reproducing-the-work)
13. [Discrepancies and interpretation cautions](#13-discrepancies-and-interpretation-cautions)
14. [Glossary](#14-glossary)
15. [Sources](#15-sources)

## 1. What these resources actually provide

**Su-shrota is a Sanskrit automatic speech recognition model: audio in, text out. It is not a chat model, translator, curriculum engine, or text-to-speech model.**

The three supplied URLs describe different parts of one research project:

| Resource | Contains | Does not contain |
|---|---|---|
| GitHub repository [S1] | Research report, training/evaluation scripts, a dictation backend, annotation tools, and a chant-practice web application | A turnkey packaged service, complete lab assets, or an LLM tutor |
| Hugging Face model [S2] | Two NeMo checkpoint archives and a model card | A guaranteed hosted inference endpoint or generated speech |
| Hugging Face dataset [S3] | Audio/transcript examples in Parquet, with train and test splits | Sanskrit instruction-following conversations or a tutor knowledge base |

Two applications demonstrate how the ASR is used:

- **Su-shrotaa:** open-ended dictation, with editable transcripts and optional correction suggestions.
- **Vagbodhini:** reference-based chant/prose practice. The intended Sanskrit text is known beforehand, so recognized syllables can be compared with it.

A third, separately released model, **Vagdhenu**, synthesizes Sanskrit chant audio from text. It is not a component inside the Su-shrota ASR checkpoint. [S8]

The right high-level mental model is:

```text
Audio recognition                Text teaching                   Speech generation
-----------------                -------------                   -----------------
Su-shrota                        Separate LLM                    Vagdhenu / other TTS
audio -> Sanskrit transcript     text -> teaching response       text -> waveform
```

The dataset helps train the first box. It does not turn that box into either of the other two.

## 2. Evidence, versions, and limits

### 2.1 Pinned artifacts

| Artifact | Inspected revision |
|---|---|
| GitHub source | `38ba20e96e27db25df22057bde01b078948b46d6` |
| Official ASR model repository | `5452d080bbffa62ff879e3ddd53b42dfa7a1db64` |
| Official dataset repository | `9ea73b50734901a5fabbb98233e062a05d1b71f0` |
| Community ONNX model, discussed in the companion | `d320b7aada7f844b2c78d4f6c935aba77d0327a0` |
| Community browser demo | `804caecb94b33974fd379b2724dbc87b47888f99` |

The GitHub snapshot contains **121 tracked files, totaling 474,803 bytes**, predominantly research scripts. Every tracked file is accounted for in the [repository map](./SUSHROTA-REPOSITORY-MAP.md). The core inference, training, data-preparation, scoring, and browser recording paths were traced directly. The inventory distinguishes experimental utilities from serving code.

The exact ASR architecture below was checked against `model_config.yaml` **inside the published v13b checkpoint**, not guessed from the word “Conformer.” A bounded HTTP range retrieved the archive prefix; the tensor payload was not downloaded or executed.

### 2.2 Evidence labels used in this report

- **Implementation:** visible behavior in the inspected source or checkpoint configuration.
- **Author-reported:** results or deployment claims in the README/model card; not independently reproduced here.
- **Observed:** metadata aggregation or browser execution performed during this research.
- **Recommendation/inference:** engineering conclusions, not a statement that a feature already exists.

No ASR retraining, full checkpoint inference evaluation, independent pronunciation study, or mobile-device benchmark was performed. The companion records a limited, successful ONNX browser smoke test.

There is a project research report and system document in the ASR repository. Those should not be described as an independently peer-reviewed validation study.

## 3. Architecture inside the checkpoint

### 3.1 Model lineage

The model is fine-tuned from AI4Bharat's Sanskrit IndicConformer hybrid checkpoint:

`ai4bharat/indicconformer_stt_sa_hybrid_ctc_rnnt_large`

The NeMo class is:

`EncDecHybridRNNTCTCBPEModel`

This name is descriptive:

- **EncDec:** encoder/decoder speech-model family.
- **Hybrid RNNT CTC:** contains both a recurrent neural network transducer branch and a connectionist temporal classification branch.
- **BPE:** output units come from subword tokenization, rather than a fixed one-token-per-word dictionary.

The authors report approximately **129 million total parameters**. The serving path uses the encoder and **CTC branch**, not the RNNT prediction/joint decoding path. Keeping the RNNT branch in a saved archive does not mean that it runs for every transcription.

### 3.2 Verified v13b configuration

| Component | Value found in the published archive |
|---|---|
| Input sample rate | 16,000 Hz |
| Feature extractor | NeMo `AudioToMelSpectrogramPreprocessor` |
| Analysis window | 25 ms, Hann window |
| Window stride | 10 ms |
| FFT size | 512 |
| Mel features | 80 |
| Feature normalization | `per_feature` |
| Configured dither | `1e-5` |
| Frame splicing | 1 |
| Encoder | NeMo `ConformerEncoder` |
| Encoder blocks | 17 |
| Hidden width | 512 |
| Feed-forward expansion | 4, nominally 2,048 hidden units in expanded FFN layers |
| Attention heads | 8 |
| Attention | Relative positional encoding; context `[-1, -1]` |
| Subsampling | Striding, factor 4 |
| Causal downsampling | False |
| Convolution kernel | 31 |
| Convolution normalization | Batch normalization |
| Main encoder/attention dropout | 0.1 |
| CTC classifier | `ConvASRDecoder`, input width 512 |
| Vocabulary | 5,632 nonblank aggregate entries plus CTC blank |
| Sanskrit sub-vocabulary | 256 entries |

The archive also contains an RNNT predictor with one recurrent layer and width 640. It remains part of the hybrid model but is bypassed in the documented CTC serving path.

**Streaming consequence:** unlimited left/right attention context and noncausal subsampling do not constitute a natively causal streaming recognizer. The web dictation tool simulates live results by repeatedly decoding bounded audio segments.

### 3.3 What a Conformer block contributes

At a conceptual level, a standard Conformer combines:

1. Feed-forward transformations of the representation.
2. Self-attention to relate distant positions in the utterance.
3. Convolution to model local acoustic patterns.
4. Another feed-forward stage and normalization.

Convolution helps with short acoustic transitions. Attention helps with context across a phrase. Learned context is not the same thing as grammar verification: the encoder can prefer a plausible transcript without proving the learner actually pronounced every sound correctly.

The exact internal operations are implemented by NeMo; this repository does not reimplement the Conformer blocks.

### 3.4 Why the multilingual vocabulary matters

The model retains an aggregate multilingual output vocabulary. The published serving code selects:

```text
Global CTC blank:               5632
Global Sanskrit token IDs:      4096 through 4351 inclusive
Number of Sanskrit tokens:      256
Selected output classes:        257, including blank

Selected column 0              -> global blank 5632
Selected column j, 1 <= j <=256 -> global ID 4096 + (j - 1)
                               -> Sanskrit tokenizer local ID j - 1
```

These are three different ID spaces. Confusing them produces bad decoding even when the acoustic model is correct.

Some experimental scripts place blank **last** for a decoder library. The production practice path and model-card example put blank **first**. Copying an experimental decoder without preserving its label order is unsafe.

## 4. From microphone samples to Sanskrit text

### 4.1 End-to-end recognition path

```text
Microphone or audio file
        |
        v
Decode container/codec -> mono waveform -> resample to 16 kHz
        |
        v
Float32 samples x[0 ... N-1] and true sample length N
        |
        v
80-channel mel features, approximately 100 frames/second
        |
        v
4x temporal subsampling + 17 Conformer blocks
        |
        v
512-wide encoded features, approximately 25 frames/second
        |
        v
CTC classifier -> [time, 5633] log probabilities
        |
        v
Select Sanskrit + blank -> [time, 257]; renormalize
        |
        v
Greedy token path -> CTC collapse -> SentencePiece surfaces
        |
        v
Devanagari transcript -> optional display transliteration
```

Frame counts are approximate: padding, windowing, and subsampling affect the exact dimensions. Use returned lengths rather than assuming `audio_seconds * 25` is always an integer valid length.

### 4.2 Audio preprocessing

Microphones commonly provide 44.1 or 48 kHz audio, often stereo. Browser recording can also produce a compressed container such as WebM/Opus or MP4/AAC.

Neither changing a filename to `.wav` nor setting a MIME type converts audio. A service must decode it, downmix if required, and resample actual samples.

For a 5-second, 16 kHz utterance:

- Sample count: 80,000.
- Float32 PCM payload: about 320 KB before transport framing.
- Mono PCM16 WAV audio payload: about 160 KB, plus a small header.

The model-card example reads a WAV but does not resample it; its stated **16 kHz mono** precondition is essential.

The practice server adds **300 ms of silence at each end** to mitigate onset/tail clipping. Its posterior function caps input at **30 seconds after padding**. This is truncation, not long-recording support; a recording near that limit can lose its tail.

### 4.3 Feature extraction

A short-time Fourier transform analyzes successive windows of sound. Mel filterbanks compress frequency information into 80 bands, and the resulting log-mel representation is normalized.

This representation captures changing spectral energy over time. It is not a spectrogram image classifier and does not require OCR or Hindi transcription.

The original NeMo model performs this preprocessing internally. The community ONNX deployment separates it into its own exported graph; matching preprocessing is part of matching the model.

### 4.4 Selecting and renormalizing Sanskrit outputs

Let `L[t,c]` be the full-vocabulary log probability at time `t`. Let `S` be the selected column list:

```text
S = [5632, 4096, 4097, ..., 4351]
```

The selected distribution is:

```text
P[t,j] = L[t,S[j]] - logsumexp_k L[t,S[k]]
```

Thus the selected classes sum to probability 1 after exponentiation. This conditions the decoder on “Sanskrit or blank.”

Subtracting a row-wise constant does not change the selected argmax, so renormalization is not needed merely to choose the largest selected score. It does matter when probabilities or sequence scores are interpreted numerically.

It also changes the meaning of confidence: a high score **within the Sanskrit slice** is not a calibrated probability that an arbitrary input really is Sanskrit.

### 4.5 CTC decoding: why blank is not just silence

CTC permits a variable-length sequence of frame labels to collapse into a shorter text sequence. Blank is “no new token emitted here.” It often occupies frames inside a sustained spoken sound, not only silent audio.

For example:

```text
Frame path:       blank, A, A, blank, A, B, B, blank
Collapse repeats: blank, A, blank, A, B, blank
Remove blanks:    A, A, B
```

The two `A` emissions separated by a blank must survive. Therefore **collapse adjacent repeats before removing blanks**. Removing blanks first incorrectly turns `A, blank, A` into one `A`.

The serving loop keeps the previous frame ID, appends only changed nonblank IDs, looks up token surfaces with the Sanskrit tokenizer, then replaces SentencePiece's `▁` boundary marker with a space.

Tokens may be pieces of words. They are not guaranteed to be words, phonemes, or complete Sanskrit aksharas.

### 4.6 Normalization and display

The research metrics generally:

1. Normalize Unicode to NFC.
2. Retain Devanagari-block text and whitespace.
3. Remove digits, danda punctuation, avagraha, the OM symbol, and specified accent marks.
4. Collapse whitespace.

The practice application additionally collapses duplicate consecutive combining marks and equates word-final `म्` with anusvara for matching.

These are **task-specific equivalences**, not a universal Sanskrit grammar model. They can erase distinctions one might want to teach. In particular, the evaluation is not testing Vedic accent correctness.

Script conversion is a separate presentation layer. Sanskrit displayed in Telugu is still Sanskrit, not a Telugu translation.

## 5. How the model is trained

### 5.1 Training example

A NeMo manifest row identifies:

```json
{
  "audio_filepath": "/data/clip.wav",
  "text": "अहं पठामि",
  "duration": 2.4,
  "lang": "sa"
}
```

This is an illustrative schema, not a quoted dataset record.

The dataloader supplies audio, lengths, tokenized transcripts, transcript lengths, and language identifiers. The custom training step runs the encoder, calls the CTC decoder, and computes CTC loss.

### 5.2 What CTC loss learns

There is no manually supplied timestamp for each target token. CTC considers all monotonic frame paths that collapse to the desired transcript:

```text
Probability(y | x) = sum over paths pi with collapse(pi)=y
                    product over frames t of p(pi[t] | x)

Loss = -log Probability(y | x)
```

A dynamic program computes that sum efficiently. Backpropagation updates the acoustic encoder and CTC-related parameters to make compatible paths more likely.

This differs from greedy inference:

- **Training:** sum over compatible paths for the correct transcript.
- **Greedy inference:** choose the best class independently at each frame, then collapse.
- **Beam search:** retain multiple candidate paths/transcripts; explored separately in this project.

The custom `training_step` **bypasses the RNNT loss**. Although the saved hybrid configuration includes an auxiliary CTC loss weight of 0.3, the inspected custom step returns CTC loss directly; the weight should not be misreported as the actual mixed-objective training recipe.

### 5.3 Verified and script-supported hyperparameters

| Setting | Evidence |
|---|---|
| Optimizer | Saved v13b config: AdamW |
| Learning rate | Saved v13b config: `3e-5` |
| Betas | Saved config: `(0.9, 0.98)` |
| Weight decay | Saved config: `0.001` |
| Schedule | Cosine annealing, 500 warmup steps, minimum LR `1e-6` |
| Batch size | Saved v13b config: 16 |
| Duration filtering | Saved config/trainer: 1-20 seconds |
| Spectrogram augmentation | 2 frequency masks, width 27; 10 time masks, width 0.05 |
| Precision | Training scripts use BF16 except their FP32 smoke mode |
| Gradient clipping | Training scripts: 1.0 |
| Validation | Training scripts disable in-loop validation; checkpoints are evaluated separately |
| Saved current epoch | README identifies the deployed model as v13b epoch 3; not independently established from tensor state |

The config's duration filter matters: the published data pool or preparation scripts can include shorter/longer clips than the training dataloader actually accepts.

### 5.4 Version evolution

- **v5:** studio/curated base, combining recitation, prose, and augmentation sources.
- **v8/v9 family:** pseudo-labels, additional scholar labels, and self-supervised experiments.
- **v10:** larger flywheel retrain from the original base, with reported studio regression.
- **v11:** continue from v5 using lower learning rate, fewer epochs, and explicit replay of flywheel data.
- **v12/v13/v13b:** continued real-user-data refinements; v13b-ep3 is the author-reported deployment.

A reproducibility nuance: `v11_prep.py` explicitly repeats flywheel rows three times by default. `v13b_prep.py` visibly writes the v5 base plus flywheel rows **once**. Do not infer that v13b definitely used the identical three-times replay schedule merely because the README groups these versions together.

## 6. Dataset construction and the feedback loop

### 6.1 Published training composition

The model and dataset cards report:

| Source | Utterances | Hours | Role |
|---|---:|---:|---|
| Scholar recordings | 2,139 | 6.06 | Known texts read by 21 reciters; aligned to references |
| Recitation corpus | 2,504 | 7.59 | Upanishad, Gita/Rigveda, and other recitation |
| TTS-speaker augmentation | 637 | 2.00 | Studio/TTS-associated source material for speaker/channel robustness |
| Clean flywheel | 1,158 | 1.73 | Selected recordings from actual practice use |
| **Total** | **6,438** | **17.37, reported approximately** | |

Component hour values are rounded.

**Do not assume “TTS augmentation” means every example was machine-generated.** `build_tts_sample.py` samples recordings and manifests from TTS-speaker corpora. `build_tts_aug.py` then applies channel augmentation. The model card describes studio/synthetic voices, but the public source label alone does not establish per-clip synthetic provenance.

### 6.2 Actual published dataset structure

The Hub API confirms:

- Five training Parquet shards: **6,438 rows**.
- One `in_the_wild_test` shard: **327 rows**.
- Four fields: `audio`, `text`, `duration`, `source`.
- Audio feature declares 16 kHz.
- Total Parquet size approximately **2.035 GB decimal**.

**Observed discrepancy:** summing `duration` across all 327 public test rows gives **2,028.63 seconds = 33.81 minutes = 0.5635 hours**, not the dataset card's “~2 hours.” All those rows have source `flywheel`; there are **98 distinct reference text strings**. This was computed from published row metadata, not by decoding every audio file.

The public schema does not expose speaker or session identifiers. That protects identity but prevents an independent session/speaker-split audit from those four fields alone.

### 6.3 Converting long recordings into labeled utterances

Two preparation approaches appear in the scripts.

**Approach A: transcription-assisted reference anchoring**

```text
Long recording
 -> normalize to 16 kHz mono
 -> split at silence
 -> transcribe segments
 -> align segment hypotheses to a known chapter text
 -> keep segments with sufficiently close reference matches
 -> label them with canonical reference text
```

`segment_align.py` uses FFmpeg silence detection, bounded segments, character matching, and a CER threshold.

**Approach B: CTC forced alignment**

```text
Long recording + ordered canonical verses
 -> compute selected CTC probabilities in windows
 -> tokenize the verses
 -> dynamic-programming alignment of target tokens to frames
 -> infer verse start/end times and alignment confidence
 -> filter by confidence and duration
 -> cut WAVs and write manifests
```

`ctcseg_logits.py` uses 28-second windows, aggregates probabilities, and computes an average frame duration. `ctcseg_align.py` calls the `ctc-segmentation` library, with defaults including score threshold -2.0 and duration 1-20 seconds.

**Forced alignment does not independently verify the words spoken.** It finds where a supplied transcript fits the audio. A high alignment score is useful for filtering but not a guarantee that a reciter made no deviations.

### 6.4 Quality tiers

The practice backend compares recognition with the target and stores tiers:

| Tier | Meaning in the implementation |
|---|---|
| `pass` | Mode-independent recognized-reference fraction at least 90%, with minimum content guards |
| `review` | At least 55% but below pass threshold |
| `low` | Below the review threshold |
| `unclear` | Too few reference/recognized aksharas |
| `override` | User affirmed/corrected an attempted reading |
| `unscored` | Recognition failed; audio was still archived |

The later clean pool accepts `pass` with no red items, or `override`, with file/label/duration checks; it can also incorporate rescued review clips. The older harvest utility is configurable and can include review rows if explicitly requested.

The trusted label is generally **the intended reference text**, not the recognizer's draft. This avoids one form of self-training error, but a target is still not necessarily a verbatim transcript. A learner can intend one phrase and say another.

An override is a user assertion, not the same as an independent expert annotation.

### 6.5 Session splits and selection bias

`v13b_prep.py`:

1. Finds sessions used by a prior v12 training manifest.
2. Groups clean clips by nonempty session ID.
3. Shuffles eligible sessions with seed 7.
4. Selects whole sessions until the requested held-out size is reached.
5. Excludes those sessions from the new training pool.
6. Checks overlap against prior training clip IDs.

This establishes **session-disjoint selection according to the available identifiers**, not necessarily speaker-disjoint selection. One person can create multiple sessions.

The held-out pool is itself selected from clean tiers. It is not an unbiased sample of every failed microphone attempt, every beginner accent, or free conversational Sanskrit.

The same reference passages may occur in train and test. Speaker/session generalization and unseen-text generalization are different questions.

### 6.6 Why “4.3% recovered” needs careful interpretation

The author reports that re-decoding the review tier recovered only 4.3%, and interprets the remainder as genuine reader deviations.

The implementation in `rescue.py` promotes a clip when **substitutions + deletions are zero** at akshara level. It separately counts “exact” matches with zero insertions.

Consequently:

- “Promoted” is not necessarily “identical transcript with no extra syllables.”
- Failure to recover a clip with another related model does not prove the human made an error.
- Models can share acoustic weaknesses; noise and annotation/reference issues remain possible.
- This is an operational rescue audit, not an independent human-labeled confusion matrix for the grader.

## 7. What the evaluation numbers mean

### 7.1 CER

Character error rate is:

```text
CER = (character substitutions + deletions + insertions)
      / number of reference characters
```

Here it is normally computed after normalization and stripping spaces, then micro-aggregated across clips.

The unit in the Python scripts is a Unicode character/code point, not a phoneme or whole akshara. Combining vowel signs can count separately. Therefore “4.36% CER” does **not** mean “95.64% of words pronounced correctly.”

### 7.2 WER

Word error rate uses whitespace-separated tokens:

```text
WER = (word substitutions + deletions + insertions)
      / number of reference words
```

Sanskrit compounds and sandhi make written boundaries variable. A spacing disagreement can heavily penalize WER while hardly affecting space-stripped CER.

WER can exceed 100% if there are many insertions. Neither CER nor WER is a calibrated per-utterance confidence score.

### 7.3 SN-WER: what the script actually computes

The project calls its supplementary metric “sandhi-normalized WER.” Implementation is more specifically a **space-insensitive reference-word damage rate**:

1. Remove spaces from hypothesis and reference.
2. Character-align the resulting strings.
3. Remember which reference word owns each reference character.
4. Mark a word damaged if a character is substituted/deleted.
5. In the strict variant, also attribute inserted characters to an adjacent reference word.
6. Divide damaged reference words by total reference words.

The reported low/high band is **two insertion-handling policies**, not a statistical confidence interval.

This metric does not implement a complete Sanskrit sandhi inversion engine. It eliminates spacing as a degree of freedom; it does not prove that every phonological or grammatical sandhi variant is equivalent.

### 7.4 Author-reported v5 versus v13b results

| Evaluation set | v5 CER | v13b CER | v5 WER | v13b WER |
|---|---:|---:|---:|---:|
| Studio gold lecture | 3.61% | 4.40% | 13.0% | 20.2% |
| Bhagavata chant | 6.00% | 5.99% | 46.4% | 46.3% |
| Vedanta prose | 7.27% | 7.23% | 30.8% | 30.4% |
| Clean in-the-wild held-out, 327 clips | 7.70% | 4.36% | 45.4% | 30.4% |

The reported in-the-wild CER improvement is:

```text
Absolute reduction: 7.70 - 4.36 = 3.34 percentage points
Relative reduction: 3.34 / 7.70 = approximately 43.4%
```

The card reports in-the-wild SN-WER of approximately **10.8-13.2%** for v13b.

Important qualifications:

- The studio gold references were created by correcting v5 drafts; the author explicitly warns of anchoring bias.
- Nevertheless, the table numerically shows a studio gold regression. “No loss anywhere” is too strong.
- Chant/prose differences of 0.01-0.04 CER points do not establish a statistically significant improvement.
- No confidence intervals, independent re-evaluation, or new-learner accent stratification were established in this research.
- Studio/chant success does not automatically establish conversational tutoring accuracy.

## 8. Experiments and lessons learned

These outcomes are the author's reported results; the scripts explain the methods.

| Experiment family | What happened underneath | Reported lesson |
|---|---|---|
| Curated CTC fine-tuning | Update pretrained encoder/CTC on recitation and prose | Established v5 baseline |
| Pseudo-label self-training | Use model transcripts, confidence gates, and cross-model agreement as labels | Repeatedly failed to improve; confident errors contaminate labels |
| Hard-negative annotation | Shortlist by entropy, then compare v5 and fine-tuned Whisper; ask scholars to label disagreements | Better use of annotation effort than labeling only easy clips |
| Continued SSL | Transfer encoder into a contrastive self-supervised model; freeze frontend and first 4 of 17 layers; adapt upper layers | SSL initialization did not beat clean supervised adaptation |
| More scholar labels | Add labeled speakers and evaluate alternative splits | Apparent gain disappeared with more honest splitting; spacing drift hurt WER |
| Rule-based resegmentation | Split merged outputs with dictionary/DP logic | Over-splitting is easy because Sanskrit admits many plausible fragments |
| ByT5 post-correction | Convert ASR output to IAST, run byte-level seq2seq correction, convert back | Overcorrected rare prose terms; not a safe automatic repair stage |
| Blank-penalty sweep | Reuse logits and reduce blank preference | Revealed onset/short-phone deletion trade-offs |
| Whisper and wav2vec2 baselines | Separate model-family fine-tuning and evaluation | IndicConformer remained strongest on the reported chant/prose tests |
| Ensembles/oracles | Compare per-utterance best-model ceilings and voting | Oracle improvement is not deployable accuracy unless a real selector achieves it |
| GOP | Force-align targets; compare target score with competing nonblank tokens | Attractive synthetic discrimination but too many practical false accusations |
| Real-user-data continuation | Mix clean target-domain audio into low-LR continuation | Largest reported real-world improvement |

### GOP deserves a separate caution

Goodness of Pronunciation experiments estimate target-token compatibility on forced-aligned frames. Blank must not be treated as an ordinary competing phone because CTC often emits it throughout valid speech.

The hard-confusable GOP tests alter **target token sequences for existing audio**, not a corpus of naturally mispronounced learner speech. Their reported AUC around 0.97-0.99 is not a measured 97-99% pronunciation-grading accuracy on real learners.

The active practice scoring path switched away from GOP to transcript comparison plus uncertainty handling.

## 9. How the chant-practice application works

### 9.1 Input and unit generation

`vagbodhini/app_practice.py` provides FastAPI endpoints; `practice.html` supplies a plain browser UI.

```text
Pasted Sanskrit in a supported script
 -> detect or honor explicitly selected script
 -> transliterate to canonical Devanagari
 -> echo a round-trip rendering for confirmation
 -> identify verse/prose units
 -> generate reference audio for each learning unit
 -> record learner
 -> recognize + compare
 -> show match / mismatch / uncertainty
```

The script registry includes Devanagari, IAST and several Roman conventions, plus multiple Indic scripts. This is script handling, not automatic translation into those languages.

### 9.2 Metre detection

The implementation converts text to SLP1 to scan laghu/guru weights:

- Long vowels and certain syllable-final markers produce heavy syllables.
- Consonant clusters can make a syllable heavy.
- The first pada is compared with known signatures.
- The final syllable is allowed metric freedom.
- Certain syllable counts fall back to anushtubh.
- Otherwise identical-quarter patterns or prose/danda boundaries are used.

This is a useful heuristic, not a complete metrical parser for every Sanskrit verse.

Units can be one pada, a paired half-verse, or a full verse. Prose uses phrase/passage grouping. Each requested unit is synthesized separately rather than made by joining existing audio clips.

The code currently uses an anushtubh reference voice for prose by default because diagnostic experiments found dropped onsets with the gadya voice. The older system document's generic prose description does not capture this implementation choice.

### 9.3 Reference TTS

The service calls a separate local TTS endpoint, caches audio by text/metre/seed, and streams NDJSON generation progress to the UI.

Default deployment described in the source:

- Practice API: port 8010.
- TTS service: port 8020.
- TTS needs its separate renderer, reference bank, vocabulary, and weights.

These are historical lab deployment defaults, not requirements for a new product.

### 9.4 Actual scoring algorithm

One encoder pass produces selected CTC log probabilities. The app obtains three greedy hypotheses by subtracting penalties **0, 3, and 6** from the blank column before argmax.

These are **three perturbations of one model's same output**, not independent recognizers.

Each hypothesis and the reference are canonicalized and split into aksharas. Dynamic programming aligns them with substitution, deletion, and insertion costs.

| Rule | Strict mode | Liberal mode |
|---|---|---|
| Green | All three decodes match the reference akshara | Any decode matches |
| Red | None matches, even if alternatives disagree | All three agree on the same substitution |
| Amber | Mixed match/nonmatch | Other uncertain cases |
| Percentage denominator | Green + red + amber | Green + red |

This distinction matters: **the strict mode is not “red only with unanimous identical error.”** That stronger condition belongs to liberal mode.

The alignment function returns an operation per reference akshara. Inserted hypothesis aksharas have no corresponding reference position and are skipped in its returned per-reference map. Thus inserted extra material is not fully represented by the displayed percentage.

The score is a task-specific transcript-match indicator, not an objective percentage of pronunciation correctness. It can miss acoustic errors the ASR normalizes and flag correct speech the ASR mishears.

### 9.5 Recording behavior

The browser uses `getUserMedia` and Web Audio, not Chrome `SpeechRecognition`.

The practice UI:

- Requests mono audio with echo cancellation, suppression, and gain control disabled.
- Warms up the mic, gives a countdown/beep, and then collects samples.
- Builds 16 kHz PCM WAV for upload.
- Offers user/reference playback and correction controls.

Its recording processor uses the older `ScriptProcessorNode`; a new application should use AudioWorklet where raw PCM processing is needed.

Its simple sample-index downsampling is also not the highest-quality anti-aliased resampling strategy. Reuse the overall flow, not every DSP shortcut.

### 9.6 Persistence and consent are part of this app, not the model

The practice code writes attempt audio and metadata to disk, including low/unclear tiers. The visible disclaimer treats use as consent. The dictation feedback route has an explicit consent field.

This differs from the later card's blanket description of “explicit consent.” A new no-database app should **not inherit training collection implicitly**.

The statement that corpus records omit raw IPs also does not mean the entire service never stores IPs: the practice app's rate-limit file is keyed by IP and date. Dataset contents, training logs, and operational logs are distinct.

## 10. How the dictation application works

### 10.1 Recognition and suggestions

`scripts/app_sushrota.py` loads NeMo on CPU, selects Sanskrit CTC outputs, and can return:

- Raw text.
- Word-like segments derived from SentencePiece boundaries.
- A confidence-like value based on emitted-token log probabilities.
- Flags and up to five suggested corrections.

Correction candidates come from:

1. A corpus/glossary frequency lexicon.
2. Edit-distance-at-most-two alternatives.
3. Candidate two-word splits.
4. CTC forward scoring of candidates against the relevant acoustic span.

The candidate scoring sums compatible CTC paths. It is stronger than choosing the most frequent dictionary neighbor, but it is not an LLM or morphological proof.

The app deliberately avoids flagging every out-of-vocabulary word: rare valid Sanskrit words and compounds are common.

### 10.2 “Live” dictation is repeated inference

`sushrotaa.html` periodically sends its accumulated current segment, displays an interim transcript, keeps a stable prefix, and finalizes bounded segments.

This is different from maintaining a causal streaming encoder state. Earlier interim text can be revised with more audio, and repeated whole-segment work can cost more than true incremental inference.

The backend applies simple silence and repeated-output guards. They are heuristics, not comprehensive voice activity detection or hallucination elimination.

### 10.3 Annotation infrastructure

The repository also contains:

- A gold-transcript editor initialized from model drafts.
- A multi-scholar annotation interface.
- In-memory claim locking with a 15-minute claim timeout.
- JSONL saves and annotation progress reporting.

These are research operations. They are not needed for the user's requested account-free Sanskrit learning MVP.

## 11. The separate speech-generation model

Vagdhenu's model card and renderer describe:

```text
Canonical Sanskrit text
 -> Sanskrit-specific text preparation
 -> Kannada-script representation for the acoustic model
 -> IndicF5/F5-TTS flow-matching diffusion-transformer-style model
 -> generated mel spectrogram
 -> fine-tuned BigVGAN-v2 vocoder
 -> 24 kHz audio waveform
```

The card reports an approximately **337M-parameter DiT**, width 1,024, depth 22, and 16 heads. The runtime wrapper defaults to 32 function evaluations for synthesis.

Why Kannada internally? The authors report that the base model's Devanagari conditioning encourages Hindi-like schwa deletion; the Kannada path better preserves their Sanskrit pronunciation target. That is a **TTS model-conditioning workaround**, not a reason to translate the curriculum through Kannada or Hindi.

The reference recording controls voice, tempo, and prosodic character. The text corresponding to the reference audio must match the spoken span. Metre labels select appropriate references; they are not direct, unlimited pitch-control knobs.

Limitations:

- Primarily a single-speaker **classical chant** model.
- Not a general multilingual support-language TTS.
- No claimed Vedic-svara support.
- Prose and conversational turn-taking need their own validation.
- Author-reported listener quality and conjunct accuracy are not independent universal guarantees.
- The inspected wrapper uses a GPU and local assets; browser-native speech synthesis cannot load this checkpoint.

The desired learning app can use this for Sanskrit reference audio, especially chant lessons, but must not confuse pleasant chanting with natural dialogue speech.

## 12. Running and reproducing the work

### 12.1 Minimum inference requirements

For the original checkpoint:

- Compatible Python/PyTorch/NeMo ASR environment.
- The v13b `.nemo` archive.
- Audio decoding and proper 16 kHz mono preprocessing.
- The Sanskrit tokenizer embedded in the archive.
- The exact selected-column mapping and CTC decoding described above.

Each published `.nemo` file is **523,192,320 bytes**, approximately 499 MiB. Runtime memory is greater than file size once weights, activations, and framework state are loaded.

Use a long-lived model process. Loading the archive for each HTTP request wastes latency and memory.

CPU execution is supported by source paths; GPU acceleration is optional for ASR. The repository includes a CPU benchmark script, but no universally applicable production throughput result follows from its existence.

### 12.2 Do not assume a generic pipeline call works

The model-card example deliberately invokes the encoder and CTC decoder and selects the Sanskrit token slice. The experiment scripts mention multilingual decoding wrinkles with generic transcription calls.

A correct wrapper should:

1. Pin the checkpoint revision.
2. Restore trusted artifacts in an isolated runtime.
3. Set evaluation/inference mode and consistent device placement.
4. Normalize input channels and rate.
5. Reject or segment overlong inputs explicitly.
6. Run encoder and CTC decoder.
7. Respect encoded lengths when batching.
8. Apply the right column map, CTC collapse, and tokenizer.
9. Return model version and any processing warnings.
10. Test deterministic preprocessing, token mapping, and transcript parity.

### 12.3 Why cloning the repository is insufficient

The source references assets not included in Git:

- Lab-root absolute paths.
- Training/evaluation manifests and canonical text corpora.
- A separate `labels.json` file, although tokenizer information can be derived from the model.
- Lexicons and corpus caches.
- The current-checkpoint symlink.
- Separate TTS renderer code, reference recordings, vocabulary, and vocoder.

There is no complete environment lock or production container in the inspected ASR tree.

The saved checkpoint advertises `nemo_version: 1.23.0rc0`, while some script paths mention a NeMo 2.7.3 cache. A saved version field and a path are not a compatibility guarantee. Determine a compatible environment experimentally and lock it.

The public dataset makes a new training/evaluation run possible, but exact historical reproduction also requires split provenance, effective training manifests, versioned dependencies, and checkpoint-selection details.

### 12.4 Licensing before reuse

| Component | Public evidence | Practical conclusion |
|---|---|---|
| ASR GitHub source | No top-level LICENSE file in inspected tracked tree | Publicly readable is not by itself a complete permission grant for redistribution |
| Official ASR weights | Card says to observe base-model terms; no standalone license tag | Clarify fine-tune redistribution/use terms |
| AI4Bharat Sanskrit base | Hub metadata declares MIT and automatic gating; raw card access returned HTTP 401 without authentication | Review actual accessible terms and gated conditions before release |
| Dataset | CC-BY-4.0 in metadata/card | Preserve attribution and license obligations; still assess voice/privacy handling |
| Community ONNX conversion | Card declares Apache-2.0 | This does not independently resolve upstream rights |
| Vagdhenu | Author contribution marked Apache-2.0; IndicF5 MIT; additional F5/BigVGAN dependencies | Review all component and weight licenses together |

This is a reuse checklist, not legal advice. The safe description at this stage is **publicly available model/code with component-specific license checks outstanding**, rather than “everything is unconditionally open-source and commercially cleared.”

## 13. Discrepancies and interpretation cautions

| Topic | Simplified claim | What the inspected evidence supports |
|---|---|---|
| Deployment version | Both apps use the latest shared checkpoint | Practice code does; checked-in dictation code still hardcodes v5, with a separate patch script to update it |
| Practice scoring | GOP in top-of-file description | Active `/score` uses free CTC hypotheses and akshara edit alignment; GOP code remains |
| Consent | Explicit consent everywhere | Practice UI says use implies consent and endpoint collects attempts; dictation has an explicit field |
| Test duration | Approximately two hours | Published duration sum is about 33.81 minutes |
| Leakage | Session split means no speaker leakage | Session-disjoint does not prove speaker-disjoint |
| Rescue | Every promotion is a perfect match | Promotion excludes substitutions/deletions; insertions are checked separately for exactness |
| Audit conclusion | Unrecovered clips must be reader mistakes | Continued model errors cannot be ruled out without independent labels |
| Confidence | High model confidence means correct transcript | Project's own pseudo-label findings contradict that assumption |
| Robustness | No loss across domains | Gold table regresses, although it has a known annotation-bias caveat |
| SN-WER | Full sandhi-aware linguistic equivalence | Space-insensitive character alignment with two word-damage counting policies |
| Tutor capability | ASR can answer learner questions | A separate LLM or teaching engine is necessary |
| Native browser support | `sa-IN` guarantees Sanskrit recognition/audio | Browser language tags request a language; actual engines/voices must be available |

These differences do not invalidate the work. They tell an implementer where a research repository needs interpretation instead of copy-and-paste deployment.

## 14. Glossary

| Term | Meaning here |
|---|---|
| ASR | Automatic speech recognition: waveform to transcript |
| TTS | Text-to-speech: text to waveform |
| LLM | Language model used for dialogue/teaching, separate from this ASR |
| PCM | Samples representing audio amplitude directly |
| Mel spectrogram | Time-frequency features used by speech models |
| Conformer | Neural encoder combining convolution and self-attention |
| CTC | Sequence loss/decoding scheme using blanks and repeated-frame collapse |
| RNNT | Alternative speech transducer architecture present but bypassed here |
| BPE / SentencePiece | Subword vocabulary/tokenizer machinery |
| Logit / log probability | Model score before / after probabilistic normalization; code paths should distinguish them |
| Akshara | Orthographic syllable-like Sanskrit unit; not identical to a code point or BPE token |
| Sandhi | Sound/orthographic changes at boundaries; also affects written word joining |
| Pada / ardha | Quarter-verse / half-verse practice units |
| Laghu / guru | Light / heavy syllable in metrical scansion |
| Forced alignment | Locate supplied text in audio; not unconstrained transcription |
| GOP | Goodness-of-Pronunciation score family |
| VAD | Voice activity detection |
| RTF | Inference seconds divided by audio seconds; below 1 is faster than real time |
| Quantization | Lower-precision model representation, requiring accuracy/compatibility validation |
| Flywheel | Collection, filtering, retraining, and reevaluation loop |

## 15. Sources

### Official project and artifacts

- **[S1]** [Pinned GitHub repository and research README](https://github.com/prathoshap/sushrota-sanskrit-asr/tree/38ba20e96e27db25df22057bde01b078948b46d6).
- **[S2]** [Pinned official ASR model card and weights](https://huggingface.co/prathoshap/sushrota-sanskrit-asr/tree/5452d080bbffa62ff879e3ddd53b42dfa7a1db64).
- **[S3]** [Pinned dataset card and shards](https://huggingface.co/datasets/prathoshap/sushrota-sanskrit-asr-data/tree/9ea73b50734901a5fabbb98233e062a05d1b71f0).
- **[S4]** [Training step and continuation trainer](https://github.com/prathoshap/sushrota-sanskrit-asr/blob/38ba20e96e27db25df22057bde01b078948b46d6/scripts/finetune_ctc_init.py).
- **[S5]** [Practice backend](https://github.com/prathoshap/sushrota-sanskrit-asr/blob/38ba20e96e27db25df22057bde01b078948b46d6/vagbodhini/app_practice.py).
- **[S6]** [CER/WER/SN-WER evaluation implementation](https://github.com/prathoshap/sushrota-sanskrit-asr/blob/38ba20e96e27db25df22057bde01b078948b46d6/scripts/eval_model.py).
- **[S7]** [v13b held-out preparation](https://github.com/prathoshap/sushrota-sanskrit-asr/blob/38ba20e96e27db25df22057bde01b078948b46d6/scripts/v13b_prep.py) and [rescue implementation](https://github.com/prathoshap/sushrota-sanskrit-asr/blob/38ba20e96e27db25df22057bde01b078948b46d6/scripts/rescue.py).
- **[S8]** [Vagdhenu model card](https://huggingface.co/prathoshap/vagdhenu), [technical report](https://github.com/prathoshap/vagdhenu/blob/main/docs/TECH_REPORT.md), and [renderer](https://github.com/prathoshap/vagdhenu/blob/main/src/render_core.py). These supplementary links are not pinned and may change.
- **[S9]** [Base-model metadata](https://huggingface.co/api/models/ai4bharat/indicconformer_stt_sa_hybrid_ctc_rnnt_large).
- **[S10]** [Dataset size API](https://datasets-server.huggingface.co/size?dataset=prathoshap/sushrota-sanskrit-asr-data) and [test-row API](https://datasets-server.huggingface.co/rows?dataset=prathoshap/sushrota-sanskrit-asr-data&config=default&split=in_the_wild_test&offset=0&length=100). The duration check paginated offsets 0, 100, 200, and 300.

### Attribution

The source project requests attribution to **Prathosh A P, “Su-shrota: Scholar-grade Sanskrit ASR and metre-aware chant practice,” Indian Institute of Science, Bengaluru, 2026**. This guide is an independent explanation of the public artifacts and does not imply author endorsement of our application or findings.

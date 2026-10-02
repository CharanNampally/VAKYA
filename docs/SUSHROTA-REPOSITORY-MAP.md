# Su-shrota: complete repository map

**Snapshot:** [`38ba20e96e27db25df22057bde01b078948b46d6`](https://github.com/prathoshap/sushrota-sanskrit-asr/tree/38ba20e96e27db25df22057bde01b078948b46d6)  
**Coverage:** all 121 tracked files; 474,803 bytes.  
**Read with:** [Technical guide](./SUSHROTA-TECHNICAL-GUIDE.md) and [app assessment](./SUSHROTA-APP-FEASIBILITY.md).

This is a research repository, not 121 independent production components. Most files document an experiment, diagnosis, or one-time data operation. The table describes purpose, not a claim that every script is runnable from a clean checkout.

All upstream paths below are relative to the pinned repository. Browse the [scripts directory](https://github.com/prathoshap/sushrota-sanskrit-asr/tree/38ba20e96e27db25df22057bde01b078948b46d6/scripts) or [practice application directory](https://github.com/prathoshap/sushrota-sanskrit-asr/tree/38ba20e96e27db25df22057bde01b078948b46d6/vagbodhini).

## 1. Start here: reports and the practice app

| File | Purpose / status |
|---|---|
| `.gitignore` | Excludes audio, model weights, data directories, and generated Python files. |
| `README.md` | Main experimental narrative and later v13b deployment/results update. |
| `docs/VAGBODHINI_2026-07-13.md` | Historical system description: services, units, TTS, scoring, and collection. Predates later model and collection changes. |
| `vagbodhini/app_practice.py` | Core FastAPI practice service: scripts, metre, units, TTS cache, ASR, comparison, feedback, collection. Its introductory GOP description is stale relative to active scoring. |
| `vagbodhini/practice.html` | Plain browser UI, recording, WAV creation, generation progress, syllable feedback, playback, and corrections. |
| `vagbodhini/tts_api.py` | Wrapper around the separate Vagdhenu renderer; text/metre/seed to WAV. Depends on external model assets and source. |
| `vagbodhini/prewarm.py` | Sends sample texts to generation to populate the TTS cache. |

## 2. Dictation, annotation, and deployment patches

| File | Purpose / status |
|---|---|
| `scripts/app_sushrota.py` | CPU dictation API with acoustic-ranked suggestions, feedback, gold editing, and scholar annotation. Checked-in checkpoint path still points to v5. |
| `scripts/sushrotaa.html` | Dictation UI: repeated interim inference, stable-prefix display, segment finalization, editable words, and optional consented feedback. |
| `scripts/annot.html` | Scholar interface to claim and label hard examples. |
| `scripts/goldtool.html` | Gold-reference editor initialized with model draft text. |
| `scripts/patch_sushrota.py` | One-time source patch adding duplicate-combining-mark cleanup. |
| `scripts/patch_sushrota2.py` | One-time source patch adding canonicalization including word-final nasal equivalence. |
| `scripts/patch_sushrota_collect.py` | One-time source patch for correction-focused collection behavior. |
| `scripts/patch_sushrota_model.py` | One-time patch switching dictation from a fixed v5 path to the shared current-model pointer. Not automatically applied by cloning. |

## 3. Audio acquisition, normalization, and metadata

| File | Purpose / status |
|---|---|
| `scripts/download_all.sh` | Lab-specific audio acquisition/download batch. |
| `scripts/fix_deno_dl.sh` | Lab-specific downloader/runtime repair helper. |
| `scripts/scope.sh` | Small source-discovery/scoping command sequence for lecture data. |
| `scripts/test_extract.sh` | Downloader/extraction smoke experiment. |
| `scripts/normalize_and_map.py` | FFmpeg conversion to 16 kHz mono WAV; derives work/speaker/chapter metadata from filenames. |
| `scripts/fix_map.py` | Manual corrections to parsed work/chapter metadata. |
| `scripts/prep_nonbhp_texts.py` | Normalize non-Bhagavata reference texts into chapter/verse inputs. |
| `scripts/build_nonbhp_jobs.py` | Assemble non-Bhagavata alignment jobs from metadata. |
| `scripts/vad_segment.py` | Silero VAD utterance segmentation, followed by WAV cutting and manifest creation. |
| `scripts/extract_timestamped.py` | Extract timestamp-associated audio segments for alignment/data preparation. |
| `scripts/offset_detect.py` | Estimate a constant offset between external timestamps and actual audio. |
| `scripts/offset_diag.py` | Diagnose timestamp offsets across several blocks. |
| `scripts/quality_gate.py` | Text/audio matching and overlap diagnostics; distinguishes alignment problems from weak ASR where possible. |

## 4. Forced alignment and training-set assembly

| File | Purpose / status |
|---|---|
| `scripts/segment_align.py` | Silence segmentation, ASR-assisted anchoring to canonical chapter text, and quality-gated utterance labels. |
| `scripts/ctcseg_logits.py` | Stage 1: windowed Sanskrit CTC probabilities and canonical verse tokenization. |
| `scripts/ctcseg_nonbhp.py` | Stage 1 variant driven by non-Bhagavata jobs. |
| `scripts/ctcseg_align.py` | Stage 2: CTC segmentation, confidence/duration filtering, cutting WAVs, and manifest creation. |
| `scripts/validate_fa.py` | Sample forced-aligned clips and compare recognition with assigned references. |
| `scripts/yield_report.py` | Per-speaker/source yield diagnostics for segmented data. |
| `scripts/merge_train.py` | Combine source manifests into a training input. |
| `scripts/prep_finetune_data.py` | Add Sanskrit language IDs and construct fine-tuning manifests/splits. |
| `scripts/build_v5.py` | Combine recitation, capped TTS-associated material, and capped disk/prose speakers; retain a prose speaker for evaluation. |
| `scripts/select_gold.py` | Select clips/drafts for human gold-reference correction. |
| `scripts/fill_blanks.py` | Re-transcribe gold-manifest clips whose draft/prefill text is empty. |

## 5. Augmentation and channel robustness

| File | Purpose / status |
|---|---|
| `scripts/build_tts_sample.py` | Stratified sampling of TTS-speaker recordings/manifests, conversion to 16 kHz, and source manifests. |
| `scripts/build_tts_aug.py` | Noise/gain/codec augmentation of studio/TTS-associated recordings. |
| `scripts/build_multicond_aug.py` | Heavier speed, pitch, noise, gain, and codec variants to diversify channels/speakers. |
| `scripts/phone_aug_train.py` | Phone-channel augmentation for a training path. |
| `scripts/phone_aug2.py` | Additional phone-channel augmentation variant. |
| `scripts/phone_eval.py` | Evaluate simulated phone/channel degradation against reference transcripts. |

## 6. Model probes, training, and self-supervision

| File | Purpose / status |
|---|---|
| `scripts/probe_model.py` | Explore model forward outputs, CTC extraction, frame rate, and Sanskrit tokenization. |
| `scripts/probe_ctc.py` | Probe CTC behavior and output access. |
| `scripts/probe2.py` | Confirm encoder-to-CTC path and Sanskrit-slice decoding. |
| `scripts/probe_train.py` | Inspect training configuration/batch behavior. |
| `scripts/finetune_ctc.py` | Original-base CTC-only adaptation using an overridden training step. |
| `scripts/finetune_ctc_init.py` | Same trainer with configurable initialization for continued or grafted models. |
| `scripts/build_ssl_poc.py` | Self-supervised encoder adaptation proof of concept and round-trip validation. |
| `scripts/build_ssl_full.py` | Larger contrastive SSL experiment; freezes frontend and lower four Conformer layers. |
| `scripts/graft_ssl.py` | Insert an SSL-adapted encoder into the hybrid model for supervised fine-tuning. |
| `scripts/finetune_w2v2.py` | wav2vec2/XLSR CTC alternative-model training. |
| `scripts/finetune_whisper.py` | Whisper-medium alternative-model fine-tuning. |

## 7. Annotation selection and pseudo-label experiments

| File | Purpose / status |
|---|---|
| `scripts/build_hardneg.py` | Early hard-example selection using entropy and out-of-vocabulary signals. |
| `scripts/build_hardneg_disagree.py` | Stronger selection through v5/Whisper disagreement, with per-speaker quotas and temporal spread. |
| `scripts/inspect_hardneg.py` | Inspect selected hard examples. |
| `scripts/label_agreement.py` | Whole-clip pseudo-labels gated by v5/Whisper agreement and confidence. |
| `scripts/label_agreement2.py` | Recut agreeing word spans to increase pseudo-label yield. |
| `scripts/scale_label.py` | Higher-yield confidence/corpus-gated labeling experiment. |
| `scripts/build_pseudo.py` | v9 teacher pseudo-labels requiring high confidence and agreement with v5. |

## 8. Versioned retrain recipes and evaluation runners

| File | Purpose / status |
|---|---|
| `scripts/v9_prep.py` | Assemble annotations and gold labels with a held-out annotation-speaker split. |
| `scripts/v9_prep_v3.py` | Revised training/evaluation split intended to remove favorable-split artifacts. |
| `scripts/v9_eval.sh` | Evaluate v9 variants against held-out, chant, and prose data. |
| `scripts/v9pl_run.sh` | Pseudo-label training/evaluation run. |
| `scripts/v9v2_run.sh` | Second v9 data/split/training recipe. |
| `scripts/v9v3_run.sh` | Third v9 recipe with formalized evaluation handling. |
| `scripts/v10_prep.py` | Select clean flywheel rows and construct session-based train/evaluation manifests. |
| `scripts/v10_run.sh` | Larger retraining from the base, followed by multi-domain evaluation. |
| `scripts/v11_prep.py` | Mix v5 data with configurable flywheel replay, default three times. |
| `scripts/v11_run.sh` | Low-LR continuation from v5, saving/evaluating epochs 3, 6, and 9. |
| `scripts/v13b_prep.py` | Larger held-out sessions unseen by prior v12 training; writes v13b data manifest. |
| `scripts/matrix_v8.sh` | Cross-domain v5/v8 evaluation matrix. |
| `scripts/run_bakeoff.sh` | Alternative-model training/evaluation orchestration. |

There is no tracked `v13b_run.sh`. The manifest preparation, generic trainer, saved checkpoint configuration, and README must be combined to understand v13b; do not invent a missing exact command history.

## 9. Recognition evaluation and exported logits

| File | Purpose / status |
|---|---|
| `scripts/baseline_eval.py` | Zero-shot IndicConformer baseline on the chant held-out set. |
| `scripts/infer_ait.py` | Base-model transcription/inference experiment and output unwrapping. |
| `scripts/export_logits.py` | Save model output scores for repeated CPU-side decoding/evaluation. |
| `scripts/eval_model.py` | Generic selected-checkpoint evaluation with CER, WER, and SN-WER variants. |
| `scripts/eval_gold.py` | v5 evaluation on corrected lecture gold references. |
| `scripts/eval_sandhi_wer.py` | Detailed space-insensitive reference-word damage metric implementation. |
| `scripts/eval_w2v2.py` | wav2vec2 fine-tune evaluation. |
| `scripts/eval_whisper.py` | Whisper fine-tune evaluation. |
| `scripts/cpu_bench.py` | Warm CPU encoder/CTC latency and real-time-factor benchmark. |
| `scripts/word_acc.py` | Word-level recognition analysis on decoded outputs. |

## 10. Decoding, lexicons, rescoring, and post-correction

| File | Purpose / status |
|---|---|
| `scripts/decode_sa.py` | Sanskrit-slice greedy/beam/KenLM decoding experiments; uses blank-last ordering for its decoder. |
| `scripts/rescore_char.py` | Character language-model rescoring experiment. |
| `scripts/rescore_eval.py` | Character-LM decoding-weight sweep over exported logits. |
| `scripts/hotword_eval.py` | Hotword/contextual-biasing tests, distinguishing realistic glossary from oracle context. |
| `scripts/build_gretil_lexicon.py` | Early GRETIL text-to-domain-lexicon builder. |
| `scripts/build_gretil_lexicon2.py` | Revised builder with script detection and validity filtering. |
| `scripts/lexicon_recall.py` | Correct-word recall among frequency-weighted suggestions. |
| `scripts/lexicon_diag.py` | Diagnose candidate generation versus ranking errors. |
| `scripts/lexicon_d2.py` | Evaluate edit-distance-two candidate recall. |
| `scripts/acoustic_rank.py` | Rank candidate words against acoustic CTC spans rather than frequency alone. |
| `scripts/eval_sastra_rescore.py` | Compare raw, lexicon-projected, and acoustically gated domain corrections. |
| `scripts/eval_segment.py` | Dictionary-based token splitting and its CER/WER consequences. |
| `scripts/eval_postcorr_real.py` | Evaluate IAST/ByT5 post-correction on real domains; separate external checkpoint dependency. |

## 11. Error diagnosis and ensemble limits

| File | Purpose / status |
|---|---|
| `scripts/error_analysis.py` | Character/phonetic-normalized errors and categories. |
| `scripts/cer_dist.py` | Per-clip/speaker/duration distributions and recurrent edit patterns. |
| `scripts/blank_sweep.py` | Blank-penalty effects, including dropped r-family sounds. |
| `scripts/inspect_onset.py` | Compare clipped versus padded starts to diagnose onset loss. |
| `scripts/onset_analysis.py` | Error rate as a function of word position. |
| `scripts/onset_flag_analysis.py` | Practice-log flag rate by early akshara position. |
| `scripts/sub_sample.py` | Sample non-obvious substitution contexts for qualitative analysis. |
| `scripts/sub_close.py` | Inspect close/phonetic substitution behavior. |
| `scripts/oracle_ensemble.py` | IndicConformer/wav2vec2 complementarity and best-per-utterance ceiling. |
| `scripts/oracle_whisper.py` | IndicConformer/Whisper complementarity ceiling. |
| `scripts/oracle_3way.py` | Three-model oracle comparison plus actual majority-vote/ROVER-style fusion. |

## 12. Pronunciation-scoring and reference-voice experiments

| File | Purpose / status |
|---|---|
| `scripts/gop_phase1.py` | Initial CTC forced-alignment/GOP experiment with easier synthetic target corruptions. |
| `scripts/gop_phase15.py` | Hard-confusable token substitutions and akshara aggregation calibration. |
| `scripts/gop_debug.py` | Inspect which competing tokens and spelling equivalences cause GOP flags. |
| `scripts/test_practice.py` | Service-level smoke checks for unit preparation/scoring; depends on running lab assets and reflects older scoring terminology. |
| `scripts/render_spike.py` | Compare separate TTS rendering of pada, half-verse, and whole verse. |
| `scripts/tts_onset_diag.py` | Diagnose generated-audio onset omissions using varied text starts. |
| `scripts/prose_meter_test.py` | Compare reference voices/metres for prose onset preservation. |

## 13. Flywheel collection, curation, and rescue

| File | Purpose / status |
|---|---|
| `scripts/analyze_flywheel.py` | Summarize collected attempts/tier metadata. |
| `scripts/harvest_flywheel.py` | Convert collection logs into training and review manifests, with quality options. |
| `scripts/flywheel_clean.py` | Later common clean-pool filter, with optional rescued rows and path deduplication. |
| `scripts/rescue.py` | Re-decode review-tier clips, promote those without reference substitutions/deletions, separately count insertion-free exact matches. |

## 14. Dependency map: what is needed for which goal?

```text
Minimal Sanskrit ASR
  checkpoint + NeMo/PyTorch + proper audio preprocessing
  + Sanskrit-slice CTC decoding
  Does NOT need: lexicons, annotation portal, TTS, learner collection.

Dictation with suggestions
  minimal ASR + corpus/glossary lexicon + acoustic candidate scoring
  + browser recording/editing interface.

Reference practice
  minimal ASR + canonical reference + transliteration/akshara alignment
  + reference audio or separate TTS.

Retraining
  labeled audio + effective manifests + trainer + separate evaluation
  + compatible environment and model initialization.

Conversational Sanskrit tutor
  ASR + separate LLM/pedagogy + separate TTS/audio + app orchestration.
  The LLM/pedagogy box is NOT supplied by this repository.
```

## 15. Missing from the tracked tree

The tree does not include a top-level source-code license, full dependency lock, containerized serving environment, complete corpus/lexicon assets, all historical evaluation logs, original lab data layouts, an LLM tutor, or an official browser export.

The model/dataset releases substantially improve accessibility, but they do not make every historical experiment turnkey. The [technical guide](./SUSHROTA-TECHNICAL-GUIDE.md#12-running-and-reproducing-the-work) explains how to distinguish implementable inference from exact experiment reproduction.

import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { AudioInputError, decodeRecording } from './audio.web';
import { speechCopy } from './copy';
import type { LocalSpeechPanelProps } from './LocalSpeechPanel';

const assetBase = process.env.EXPO_PUBLIC_BASE_PATH ?? '';

type Phase = 'idle' | 'loading' | 'ready' | 'requesting' | 'recording' | 'transcribing' | 'error';
type WorkerMessage =
  | { type: 'progress'; progress: number }
  | { type: 'ready' }
  | { type: 'warning'; code: string }
  | { type: 'result'; text: string; milliseconds: number }
  | { type: 'error'; code: string; detail: string };

export default function LocalSpeechPanel({ language, onUseTranscript }: LocalSpeechPanelProps) {
  const copy = speechCopy[language];
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const [errorKey, setErrorKey] = useState<keyof typeof copy | null>(null);
  const [cacheWarning, setCacheWarning] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [milliseconds, setMilliseconds] = useState<number | null>(null);
  const [sample, setSample] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const worker = useRef<Worker | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const watchdog = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const generation = useRef(0);
  const active = useRef(false);
  const sampleRequest = useRef<AbortController | null>(null);

  function stopTracks() {
    if (timer.current) clearInterval(timer.current);
    if (stopTimer.current) clearTimeout(stopTimer.current);
    timer.current = null;
    stopTimer.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  }

  function dispose() {
    generation.current++;
    if (watchdog.current) clearTimeout(watchdog.current);
    if (recorder.current) {
      recorder.current.onstop = null;
      recorder.current.onerror = null;
      if (recorder.current.state !== 'inactive') recorder.current.stop();
      recorder.current = null;
    }
    stopTracks();
    sampleRequest.current?.abort();
    sampleRequest.current = null;
    worker.current?.terminate();
    worker.current = null;
    active.current = false;
  }

  useEffect(() => () => dispose(), []);
  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);

  function failModel() {
    dispose();
    setPhase('error');
    setErrorKey('modelError');
  }

  function load() {
    dispose();
    setErrorKey(null);
    setCacheWarning(false);
    setProgress(0);
    if (!window.isSecureContext || typeof Worker === 'undefined' || typeof WebAssembly === 'undefined') {
      setErrorKey('secureError');
      setPhase('error');
      return;
    }
    setPhase('loading');
    const epoch = generation.current;
    try {
      const nextWorker = new Worker(`${assetBase}/asr/worker.js`, { type: 'module' });
      worker.current = nextWorker;
      nextWorker.onmessage = ({ data }: MessageEvent<WorkerMessage>) => {
        if (epoch !== generation.current) return;
        if (data.type === 'progress') setProgress(data.progress);
        else if (data.type === 'warning') setCacheWarning(true);
        else if (data.type === 'ready') {
          if (watchdog.current) clearTimeout(watchdog.current);
          setPhase('ready');
        } else if (data.type === 'result') {
          if (watchdog.current) clearTimeout(watchdog.current);
          active.current = false;
          setPhase('ready');
          setTranscript(data.text);
          setMilliseconds(data.milliseconds);
          if (!data.text) setErrorKey('silence');
        } else if (data.type === 'error') {
          console.error('Local ASR worker:', data.detail);
          if (data.code === 'model') failModel();
          else {
            if (watchdog.current) clearTimeout(watchdog.current);
            active.current = false;
            setPhase('ready');
            setErrorKey('inferenceError');
          }
        }
      };
      nextWorker.onerror = (event) => {
        if (epoch !== generation.current) return;
        console.error('ASR worker could not run:', event.message);
        failModel();
      };
      watchdog.current = setTimeout(failModel, 360000);
      nextWorker.postMessage({ type: 'load' });
    } catch (error) {
      console.error('ASR worker could not start:', error);
      failModel();
    }
  }

  async function recognize(blob: Blob, epoch: number) {
    try {
      const pcm = await decodeRecording(blob);
      if (epoch !== generation.current || !worker.current) return;
      setAudioUrl(URL.createObjectURL(blob));
      watchdog.current = setTimeout(() => {
        dispose();
        setErrorKey('inferenceError');
        setPhase('error');
      }, 60000);
      worker.current.postMessage({ type: 'transcribe', pcm }, [pcm.buffer]);
    } catch (error) {
      if (epoch !== generation.current) return;
      console.error('Could not prepare Sanskrit audio:', error);
      active.current = false;
      setErrorKey(error instanceof AudioInputError
        ? error.code === 'silence' ? 'silence' : 'durationError'
        : 'audioError');
      setPhase('ready');
    }
  }

  function beginAudio(isSample: boolean) {
    setErrorKey(null);
    setTranscript('');
    setMilliseconds(null);
    setAudioUrl(null);
    setSample(isSample);
    active.current = true;
  }

  function stopRecording() {
    if (recorder.current?.state === 'recording') {
      setPhase('transcribing');
      recorder.current.stop();
      stopTracks();
    }
  }

  async function record() {
    if (active.current || phase !== 'ready') return;
    beginAudio(false);
    setPhase('requesting');
    const epoch = generation.current;
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error('Recording is not supported.');
      const media = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 } });
      if (epoch !== generation.current) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = media;
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus']
        .find((type) => MediaRecorder.isTypeSupported(type));
      const recording = new MediaRecorder(media, mimeType ? { mimeType } : undefined);
      recorder.current = recording;
      const chunks: Blob[] = [];
      recording.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recording.onerror = (event) => {
        console.error('Microphone recording failed:', event);
        recording.onstop = null;
        if (recording.state !== 'inactive') recording.stop();
        stopTracks();
        active.current = false;
        setPhase('ready');
        setErrorKey('micError');
      };
      recording.onstop = () => {
        recorder.current = null;
        stopTracks();
        if (epoch !== generation.current) return;
        setPhase('transcribing');
        void recognize(new Blob(chunks, { type: recording.mimeType }), epoch);
      };
      recording.start();
      setSeconds(0);
      setPhase('recording');
      const started = Date.now();
      timer.current = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 250);
      // Stop before the 15-second input cap to allow for recorder/codec finalization.
      stopTimer.current = setTimeout(stopRecording, 14500);
    } catch (error) {
      if (epoch !== generation.current) return;
      console.error('Microphone access failed:', error);
      stopTracks();
      active.current = false;
      setPhase('ready');
      setErrorKey('micError');
    }
  }

  async function useSample() {
    if (active.current || phase !== 'ready') return;
    beginAudio(true);
    setPhase('transcribing');
    const epoch = generation.current;
    const controller = new AbortController();
    sampleRequest.current = controller;
    try {
      const response = await fetch(`${assetBase}/audio/sushrota-sample.wav`, { signal: controller.signal });
      if (!response.ok) throw new Error(`Sample unavailable (${response.status}).`);
      await recognize(await response.blob(), epoch);
    } catch (error) {
      if (epoch !== generation.current) return;
      console.error('Public sample could not load:', error);
      active.current = false;
      setPhase('ready');
      setErrorKey('audioError');
    }
  }

  const working = ['loading', 'requesting', 'recording', 'transcribing'].includes(phase);
  return (
    <View style={styles.panel} testID="local-speech-panel">
      <Text style={styles.title}>{copy.title}</Text>
      <Text style={styles.subtitle}>{copy.subtitle}</Text>
      <Text style={styles.body}>{copy.privacy}</Text>
      {(phase === 'idle' || phase === 'error') && (
        <Pressable accessibilityRole="button" testID="load-asr" style={styles.primary} onPress={load}>
          <Text style={styles.primaryText}>{phase === 'error' ? copy.retry : copy.download}</Text>
        </Pressable>
      )}
      <View accessibilityLiveRegion="polite">
        {phase === 'loading' && (
          <View style={styles.statusRow}>
            <ActivityIndicator color="#D96332" />
            <Text style={styles.body}>{progress === 100 ? copy.compiling : `${copy.loading} · ${progress}%`}</Text>
          </View>
        )}
        {phase === 'ready' && <Text testID="asr-ready" style={styles.ready}>{copy.ready}</Text>}
        {phase === 'recording' && <Text style={styles.ready}>{copy.recording} · {seconds} {copy.seconds}</Text>}
        {(phase === 'transcribing' || phase === 'requesting') && (
          <View style={styles.statusRow}><ActivityIndicator color="#D96332" /><Text style={styles.body}>{phase === 'requesting' ? copy.record : copy.transcribing}</Text></View>
        )}
      </View>
      {phase === 'ready' && (
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" testID="record-asr" onPress={record} style={styles.primary}><Text style={styles.primaryText}>{copy.record}</Text></Pressable>
          <Pressable accessibilityRole="button" testID="upload-asr" onPress={() => fileInput.current?.click()} style={styles.secondary}><Text style={styles.secondaryText}>{copy.upload}</Text></Pressable>
          <Pressable accessibilityRole="button" testID="sample-asr" onPress={useSample} style={styles.secondary}><Text style={styles.secondaryText}>{copy.sample}</Text></Pressable>
        </View>
      )}
      {phase === 'recording' && <Pressable accessibilityRole="button" testID="stop-asr" onPress={stopRecording} style={styles.primary}><Text style={styles.primaryText}>{copy.stop}</Text></Pressable>}
      {working && <Pressable accessibilityRole="button" testID="cancel-asr" onPress={() => { dispose(); setPhase('idle'); setErrorKey(null); }} style={styles.secondary}><Text style={styles.secondaryText}>{copy.cancel}</Text></Pressable>}
      <input ref={fileInput} type="file" accept="audio/*" aria-label={copy.upload} style={{ display: 'none' }} onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file || active.current || phase !== 'ready') return;
        beginAudio(false);
        setPhase('transcribing');
        void recognize(file, generation.current);
      }} />
      {cacheWarning && <Text style={styles.body}>{copy.cacheWarning}</Text>}
      {errorKey && <Text accessibilityRole="alert" testID="asr-error" style={styles.error}>{copy[errorKey]}</Text>}
      {transcript !== '' && (
        <View style={styles.result}>
          <Text style={styles.subtitle}>{copy.transcript}</Text>
          <TextInput testID="asr-transcript" accessibilityLabel={copy.transcript} multiline value={transcript} onChangeText={setTranscript} style={styles.transcript} />
          <Text style={styles.body}>{copy.resultNote}</Text>
          {milliseconds !== null && <Text testID="asr-timing" style={styles.subtitle}>{copy.time}: {milliseconds} {copy.milliseconds}</Text>}
          {onUseTranscript && <Pressable accessibilityRole="button" disabled={!transcript.trim()} testID="use-transcript" onPress={() => onUseTranscript(transcript.trim())} style={styles.primary}><Text style={styles.primaryText}>{copy.use}</Text></Pressable>}
        </View>
      )}
      {audioUrl && <audio controls src={audioUrl} style={{ width: '100%' }} />}
      {sample && <Text style={styles.body}>{copy.sampleReference}</Text>}
      <Text style={styles.footnote}>{onUseTranscript ? copy.sendNotice : copy.tutorUnavailable}</Text>
      <Text style={styles.footnote}>{copy.attribution}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: '#FFFDF8', borderWidth: 1, borderColor: '#E7DED0', borderRadius: 20, padding: 20, gap: 12, marginVertical: 14 },
  title: { color: '#25231F', fontSize: 24, fontWeight: '700' },
  subtitle: { color: '#4F6856', fontSize: 12, fontWeight: '700' },
  body: { color: '#766F64', fontSize: 14, lineHeight: 22, flexShrink: 1 },
  ready: { color: '#4F6856', fontSize: 14, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  primary: { backgroundColor: '#D96332', borderRadius: 12, padding: 14, alignItems: 'center' },
  primaryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  secondary: { borderColor: '#E7DED0', borderWidth: 1, borderRadius: 12, padding: 14, alignItems: 'center' },
  secondaryText: { color: '#4F6856', fontSize: 14, fontWeight: '700' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  result: { borderTopColor: '#E7DED0', borderTopWidth: 1, paddingTop: 14, gap: 10 },
  transcript: { color: '#25231F', fontSize: 23, lineHeight: 36, minHeight: 80, borderWidth: 1, borderColor: '#E7DED0', borderRadius: 10, padding: 12 },
  error: { color: '#A33B33', backgroundColor: '#F8E7E4', padding: 12, borderRadius: 10 },
  footnote: { color: '#766F64', fontSize: 11, lineHeight: 17 },
});

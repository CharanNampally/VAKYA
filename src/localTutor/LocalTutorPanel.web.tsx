import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { languageNames, t } from '../content';
import { SupportLanguage } from '../types';
import LocalSpeechPanel from '../speech/LocalSpeechPanel';
import { canRun, Capabilities, CompanionError, connectCompanion, ErrorCode, HistoryItem, LocalResult, Mode, runLocalTutor, SourceLanguage } from './api';
import { localCopy } from './copy';
import type { LocalTutorProps } from './LocalTutorPanel';

export default function LocalTutorPanel({ language, level }: LocalTutorProps) {
  const copy = localCopy[language];
  const [token, setToken] = useState('');
  const [pairedToken, setPairedToken] = useState('');
  const [capability, setCapability] = useState<Capabilities | null>(null);
  const [mode, setMode] = useState<Mode>('teach');
  const [source, setSource] = useState<SourceLanguage>(language);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<'connect' | 'inference' | null>(null);
  const [error, setError] = useState<ErrorCode | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [turns, setTurns] = useState<Array<{ input: string; output: LocalResult; language: SupportLanguage }>>([]);
  const active = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      active.current?.abort();
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function cancel() {
    active.current?.abort();
    active.current = null;
    if (timer.current) clearTimeout(timer.current);
    setBusy(null);
    setCancelled(true);
  }

  async function execute(connecting: boolean) {
    if (active.current) return;
    if (!connecting && (!capability || !canRun(capability, mode, source))) {
      setError('provider_unavailable');
      return;
    }
    const controller = new AbortController();
    active.current = controller;
    setBusy(connecting ? 'connect' : 'inference');
    setError(null);
    setCancelled(false);
    timer.current = setTimeout(() => {
      controller.abort();
      if (active.current === controller && mounted.current) {
        active.current = null;
        setBusy(null);
        setError('unreachable');
      }
    }, connecting ? 10000 : 300000);
    try {
      if (connecting) {
        const next = await connectCompanion(token.trim(), controller.signal);
        if (active.current !== controller || !mounted.current) return;
        setCapability(next);
        setPairedToken(token.trim());
      } else {
        const body = mode === 'analyze' ? { text: text.trim() }
          : mode === 'teach' ? { text: text.trim(), sourceLanguage: source }
            : { text: text.trim(), sourceLanguage: source, supportLanguage: language, level, history };
        const output = await runLocalTutor(mode, pairedToken, controller.signal, body);
        if (active.current !== controller || !mounted.current) return;
        if (mode === 'converse' && output.history) setHistory(output.history);
        setTurns((previous) => [...previous, { input: text.trim(), output, language }].slice(-6));
      }
    } catch (reason) {
      if (controller.signal.aborted || !mounted.current || active.current !== controller) return;
      const code = reason instanceof CompanionError ? reason.code : 'inference_failed';
      setError(code);
      if (connecting || code === 'unauthorized') {
        setCapability(null);
        setPairedToken('');
      }
    } finally {
      if (active.current === controller) {
        active.current = null;
        if (timer.current) clearTimeout(timer.current);
        if (mounted.current) setBusy(null);
      }
    }
  }

  return (
    <View style={styles.panel} testID="local-tutor">
      <Text style={styles.title}>{copy.title}</Text>
      <Text style={styles.body}>{copy.intro}</Text>
      <Text style={styles.label}>{copy.pairing}</Text>
      <Text style={styles.body}>{copy.setup}</Text>
      <TextInput testID="companion-token" accessibilityLabel={copy.token} secureTextEntry autoCapitalize="none" autoCorrect={false} value={token} onChangeText={setToken} style={styles.input} placeholder={copy.token} editable={!busy} />
      <View style={styles.row}>
        <Pressable accessibilityRole="button" testID="connect-companion" disabled={!!busy || !token.trim()} onPress={() => execute(true)} style={styles.button}><Text style={styles.buttonText}>{copy.connect}</Text></Pressable>
        {capability && <Pressable accessibilityRole="button" onPress={() => { cancel(); setCapability(null); setPairedToken(''); setToken(''); setHistory([]); setTurns([]); }} style={styles.secondary}><Text>{copy.disconnect}</Text></Pressable>}
      </View>
      {busy && <View style={styles.row}><ActivityIndicator /><Text style={styles.body}>{busy === 'connect' ? copy.connecting : copy.working}</Text><Pressable accessibilityRole="button" testID="cancel-local" onPress={cancel}><Text>{copy.cancel}</Text></Pressable></View>}
      {cancelled && <Text style={styles.body}>{copy.cancelNote}</Text>}
      {error && <Text accessibilityRole="alert" style={styles.error}>{copy[error]}</Text>}
      {capability && <>
        <Text testID="companion-connected" style={styles.label}>{copy.connected}</Text>
        {Object.entries(capability.translation).map(([name, ready]) => <Text key={name} style={styles.body}>{name}: {ready ? copy.ready : copy.missing}</Text>)}
        <View style={styles.row}>
          {(['teach', 'converse', 'analyze'] as Mode[]).map((item) => <Pressable key={item} accessibilityRole="button" testID={`local-mode-${item}`} disabled={!!busy} onPress={() => { setMode(item); if (item === 'analyze') setSource('sa'); }} style={[styles.secondary, mode === item && styles.selected]}><Text>{copy[item]}</Text></Pressable>)}
        </View>
        <Text style={styles.label}>{copy.source}</Text>
        {mode === 'converse' && <Text style={styles.body}>{copy.conversationNote}</Text>}
        <View style={styles.row}>
          {(['en', 'hi', 'te', 'sa'] as SourceLanguage[]).map((item) => <Pressable key={item} accessibilityRole="button" testID={`local-source-${item}`} disabled={!!busy || (mode === 'analyze' && item !== 'sa')} onPress={() => setSource(item)} style={[styles.secondary, source === item && styles.selected]}><Text>{item === 'sa' ? 'संस्कृतम्' : languageNames[item]}</Text></Pressable>)}
        </View>
        <TextInput testID="local-tutor-input" accessibilityLabel={copy.placeholder} multiline maxLength={400} value={text} onChangeText={setText} placeholder={copy.placeholder} editable={!busy} style={[styles.input, { minHeight: 90 }]} />
        {!canRun(capability, mode, source) && <Text style={styles.body}>{copy.unavailable}</Text>}
        <Pressable accessibilityRole="button" testID="run-local" disabled={!!busy || !text.trim() || !canRun(capability, mode, source)} onPress={() => execute(false)} style={[styles.button, (busy || !text.trim() || !canRun(capability, mode, source)) && styles.disabled]}><Text style={styles.buttonText}>{copy.submit}</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={!!busy} onPress={() => { setHistory([]); setTurns([]); }}><Text>{copy.clear}</Text></Pressable>
      </>}
      {turns.map((turn, index) => <View key={index} testID="local-result" style={styles.result}>
        <Text style={styles.body}>{turn.input}</Text>
        {turn.output.sanskrit && <Text style={styles.sanskrit}>{turn.output.sanskrit}</Text>}
        {turn.output.transliteration && <Text style={styles.body}>{turn.output.transliteration}</Text>}
        {turn.output.support && <Text style={styles.body}>{turn.output.support}</Text>}
        {turn.output.support && turn.language !== language && <Text style={styles.body}>{t('previousReply', language)}</Text>}
        {turn.output.warnings.map((warning) => <Text key={warning} style={styles.body}>{copy[warning]}</Text>)}
        {turn.output.words?.map((word, wordIndex) => <View key={wordIndex}>
          <Text style={styles.label}>{word.word}</Text>
          {word.candidates.length === 0 ? <Text style={styles.body}>{copy.noCandidates}</Text>
            : word.candidates.map((candidate, candidateIndex) => <Text key={candidateIndex} style={styles.body}>{candidate.root}: {candidate.tags.join(' · ')}</Text>)}
        </View>)}
        <Text style={styles.body}>{copy.provider}: {turn.output.provider}</Text>
      </View>)}
      <Text style={styles.body}>{copy.speechMissing}</Text>
      <Text style={styles.body}>{copy.privacy}</Text>
      <LocalSpeechPanel language={language} usage="local" onUseTranscript={busy ? undefined : (value) => { setText(value); setSource('sa'); }} />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { padding: 20, gap: 14, borderWidth: 1, borderColor: '#E7DED0', borderRadius: 20, backgroundColor: '#FFFDF8', marginVertical: 14 },
  title: { fontSize: 25, fontWeight: '700', color: '#25231F' },
  label: { fontSize: 15, fontWeight: '700', color: '#4F6856' },
  body: { fontSize: 14, color: '#766F64', lineHeight: 22 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  input: { borderWidth: 1, borderColor: '#E7DED0', borderRadius: 10, padding: 12, fontSize: 16, color: '#25231F' },
  button: { padding: 14, borderRadius: 12, backgroundColor: '#D96332', alignItems: 'center' },
  buttonText: { color: '#FFFFFF', fontWeight: '700' },
  secondary: { padding: 12, borderWidth: 1, borderColor: '#E7DED0', borderRadius: 12 },
  selected: { backgroundColor: '#F5E2CF', borderColor: '#D96332' },
  disabled: { opacity: 0.5 },
  error: { color: '#A33B33', padding: 12, backgroundColor: '#F8E7E4' },
  result: { gap: 8, paddingTop: 16, borderTopWidth: 1, borderColor: '#E7DED0' },
  sanskrit: { fontSize: 25, color: '#25231F', lineHeight: 38 },
});

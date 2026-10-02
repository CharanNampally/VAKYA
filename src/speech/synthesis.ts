import { Platform } from 'react-native';
import * as Speech from 'expo-speech';
import { fetchSanskritSpeech, SanskritSpeechError } from './ttsApi';

let activeAudio: HTMLAudioElement | null = null;
let activeUrl: string | null = null;

export async function speakSanskrit(text: string, rate = 0.8): Promise<void> {
  if (!text.trim()) return;
  if (Platform.OS !== 'web') {
    Speech.speak(text, { language: 'sa-IN', rate });
    return;
  }

  activeAudio?.pause();
  if (activeUrl) URL.revokeObjectURL(activeUrl);

  const url = URL.createObjectURL(await fetchSanskritSpeech(text));
  const audio = new Audio(url);
  activeAudio = audio;
  activeUrl = url;
  const cleanup = () => {
    if (activeAudio === audio) activeAudio = null;
    if (activeUrl === url) activeUrl = null;
    URL.revokeObjectURL(url);
  };
  audio.addEventListener('ended', cleanup, { once: true });
  audio.addEventListener('error', cleanup, { once: true });
  try {
    await audio.play();
  } catch (error) {
    cleanup();
    throw new SanskritSpeechError('The browser could not play Sanskrit speech.', { cause: error });
  }
}

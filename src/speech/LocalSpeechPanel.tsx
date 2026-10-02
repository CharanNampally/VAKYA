import { SupportLanguage } from '../types';

export type LocalSpeechPanelProps = {
  language: SupportLanguage;
  onUseTranscript?: (text: string) => void;
  usage?: 'reply' | 'local';
};

// Native builds retain the server transcription path; this panel is browser-only.
export default function LocalSpeechPanel(_props: LocalSpeechPanelProps) {
  return null;
}

import { Text, View } from 'react-native';
import { Level, SupportLanguage } from '../types';
import { localCopy } from './copy';
import { usingHostedTutor } from './api';
import TutorPanel from './TutorPanel';

export type LocalTutorProps = { language: SupportLanguage; level: Level };

export default function LocalTutorPanel({ language, level }: LocalTutorProps) {
  if (usingHostedTutor) return <TutorPanel language={language} level={level} />;
  return <View style={{ padding: 24 }}><Text>{localCopy[language].native}</Text></View>;
}

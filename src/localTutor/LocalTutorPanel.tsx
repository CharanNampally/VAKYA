import { Text, View } from 'react-native';
import { Level, SupportLanguage } from '../types';
import { localCopy } from './copy';

export type LocalTutorProps = { language: SupportLanguage; level: Level };

export default function LocalTutorPanel({ language }: LocalTutorProps) {
  return <View style={{ padding: 24 }}><Text>{localCopy[language].native}</Text></View>;
}

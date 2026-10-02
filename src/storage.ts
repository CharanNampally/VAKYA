import AsyncStorage from '@react-native-async-storage/async-storage';
import { Preferences } from './types';
import { parseLanguage } from './language';

const STORAGE_KEY = 'vakya.preferences.v1';
const LANGUAGE_KEY = 'vakya.language.v1';

export const defaultPreferences: Preferences = {
  supportLanguage: 'en',
  scriptPreference: 'both',
  level: 'beginner',
  completedLessonIds: [],
  streak: 1,
};

export async function loadPreferences(): Promise<Preferences | null> {
  const value = await AsyncStorage.getItem(STORAGE_KEY);
  if (!value) return null;
  const stored = { ...defaultPreferences, ...JSON.parse(value) } as Preferences;
  const language = parseLanguage(stored.supportLanguage);
  if (!language) console.warn('Unsupported saved language; using English.');
  return { ...stored, supportLanguage: language ?? 'en' };
}

export async function loadLanguage() {
  const value = await AsyncStorage.getItem(LANGUAGE_KEY);
  const language = parseLanguage(value);
  if (value !== null && !language) console.warn('Unsupported saved language selection.');
  return language;
}

export async function saveLanguage(language: Preferences['supportLanguage']) {
  await AsyncStorage.setItem(LANGUAGE_KEY, language);
}

export async function savePreferences(preferences: Preferences): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
}

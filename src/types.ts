export type SupportLanguage = 'en' | 'hi' | 'te';
export type ScriptPreference = 'devanagari' | 'iast' | 'both';
export type Level = 'beginner' | 'intermediate' | 'advanced';

export type Preferences = {
  supportLanguage: SupportLanguage;
  scriptPreference: ScriptPreference;
  level: Level;
  completedLessonIds: string[];
  streak: number;
};

export type LocalizedText = Record<SupportLanguage, string>;

export type Lesson = {
  id: string;
  number: number;
  title: LocalizedText;
  subtitle: LocalizedText;
  duration: number;
  icon: string;
  color: string;
  phrases: Array<{
    devanagari: string;
    iast: string;
    meaning: LocalizedText;
  }>;
};

export type TutorMessage = {
  id: string;
  role: 'tutor' | 'learner';
  sanskrit?: string;
  transliteration?: string;
  support?: string;
  supportLanguage?: SupportLanguage;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
};

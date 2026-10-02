import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar as NativeStatusBar,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { StatusBar } from 'expo-status-bar';

import { askTutor, transcribeAudio, TutorApiUnavailableError } from './src/api';
import { languageNames, lessons, t } from './src/content';
import { defaultPreferences, loadLanguage, loadPreferences, saveLanguage, savePreferences } from './src/storage';
import { languageFromUrl, urlWithLanguage } from './src/language';
import LocalSpeechPanel from './src/speech/LocalSpeechPanel';
import { speechCopy } from './src/speech/copy';
import { speakSanskrit } from './src/speech/synthesis';
import LocalTutorPanel from './src/localTutor/LocalTutorPanel';
import { tutorCopy as localCopy } from './src/localTutor/copy';
import { SourceLanguage, usingHostedTutor } from './src/localTutor/api';
import {
  Lesson,
  Level,
  Preferences,
  ScriptPreference,
  SupportLanguage,
  TutorMessage,
} from './src/types';

type Screen = 'learn' | 'practice' | 'local' | 'progress' | 'settings';

const colors = {
  ink: '#25231F',
  muted: '#766F64',
  cream: '#F8F3E9',
  paper: '#FFFDF8',
  saffron: '#D96332',
  saffronDark: '#A83F1D',
  leaf: '#4F6856',
  leafLight: '#DDE8DE',
  line: '#E7DED0',
  white: '#FFFFFF',
  error: '#A33B33',
};

const levelLabels: Record<Level, Record<SupportLanguage, string>> = {
  beginner: { en: 'New to Sanskrit', hi: 'संस्कृत में नया', te: 'సంస్కృతానికి కొత్త' },
  intermediate: { en: 'I know the basics', hi: 'मुझे मूल बातें आती हैं', te: 'నాకు ప్రాథమికాలు తెలుసు' },
  advanced: { en: 'I can converse', hi: 'मैं वार्तालाप कर सकता हूँ', te: 'నేను సంభాషించగలను' },
};

const initialTutorMessage: TutorMessage = {
  id: 'welcome',
  role: 'tutor',
  sanskrit: 'नमस्ते! अद्य वयं सम्भाषणस्य अभ्यासं कुर्मः।',
  transliteration: 'namaste! adya vayaṃ sambhāṣaṇasya abhyāsaṃ kurmaḥ.',
};

function LanguageSelector({ language, onChange }: {
  language: SupportLanguage;
  onChange: (language: SupportLanguage) => void;
}) {
  return (
    <View style={styles.languageBar} testID="language-selector">
      <Text style={styles.languageLabel}>{t('supportLanguage', language)}</Text>
      <View style={styles.chipRow} accessibilityRole="radiogroup" accessibilityLabel={t('supportLanguage', language)}>
        {(Object.keys(languageNames) as SupportLanguage[]).map((item) => (
          <Pressable
            key={item}
            testID={`select-language-${item}`}
            accessibilityRole="radio"
            aria-checked={language === item}
            onPress={() => onChange(item)}
            style={[styles.chip, language === item && styles.chipActive]}
          >
            <Text style={[styles.chipText, language === item && styles.chipTextActive]}>{languageNames[item]}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function ChoiceCard({
  active,
  title,
  subtitle,
  onPress,
  testID,
}: {
  active: boolean;
  title: string;
  subtitle?: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [styles.choiceCard, active && styles.choiceCardActive, pressed && styles.pressed]}
    >
      <View style={[styles.choiceDot, active && styles.choiceDotActive]}>
        {active ? <View style={styles.choiceDotInner} /> : null}
      </View>
      <View style={styles.flex}>
        <Text style={[styles.choiceTitle, active && styles.choiceTitleActive]}>{title}</Text>
        {subtitle ? <Text style={styles.choiceSubtitle}>{subtitle}</Text> : null}
      </View>
    </Pressable>
  );
}

function Onboarding({
  preferences,
  onChange,
  onComplete,
  onTryTranscription,
  onTryLocalTutor,
}: {
  preferences: Preferences;
  onChange: (preferences: Preferences) => void;
  onComplete: (preferences: Preferences) => void;
  onTryTranscription: () => void;
  onTryLocalTutor: () => void;
}) {
  const [step, setStep] = useState(0);
  const language = preferences.supportLanguage;

  const copy = [
    {
      eyebrow: 'VĀKYA · वाक्य',
      title: t('welcomeTitle', language),
      body: t('welcomeBody', language),
    },
    {
      eyebrow: `1 · ${t('supportLanguage', language)}`,
      title: t('languageTitle', language),
      body: t('languageBody', language),
    },
    {
      eyebrow: `2 · ${t('script', language)}`,
      title: t('scriptTitle', language),
      body: t('scriptBody', language),
    },
    {
      eyebrow: `3 · ${t('level', language)}`,
      title: t('levelTitle', language),
      body: t('levelBody', language),
    },
  ][step];

  return (
    <View style={styles.onboarding}>
      <StatusBar style="dark" />
      <View style={styles.onboardingTop}>
        <Text style={styles.eyebrow}>{copy.eyebrow}</Text>
        {step > 0 ? (
          <Pressable onPress={() => setStep((value) => value - 1)} hitSlop={12}>
            <Text style={styles.back}>← {t('back', language)}</Text>
          </Pressable>
        ) : null}
      </View>
      <ScrollView contentContainerStyle={styles.onboardingContent}>
        {step === 0 ? (
          <View style={styles.heroMark}>
            <Text style={styles.heroMarkText}>व</Text>
            <View style={styles.heroOrbit} />
          </View>
        ) : null}
        <Text style={[styles.displayTitle, step === 0 && styles.centerText]}>{copy.title}</Text>
        <Text style={[styles.lead, step === 0 && styles.centerText]}>{copy.body}</Text>

        <View style={styles.choices}>
          {step === 1
            ? (Object.keys(languageNames) as SupportLanguage[]).map((item) => (
                <ChoiceCard
                  key={item}
                  testID={`language-${item}`}
                  active={language === item}
                  title={languageNames[item]}
                  onPress={() => onChange({ ...preferences, supportLanguage: item })}
                />
              ))
            : null}
          {step === 2 ? (
            <>
              <ChoiceCard
                active={preferences.scriptPreference === 'devanagari'}
                title="संस्कृतम्"
                subtitle={t('devanagari', language)}
                onPress={() => onChange({ ...preferences, scriptPreference: 'devanagari' })}
              />
              <ChoiceCard
                active={preferences.scriptPreference === 'iast'}
                title="saṃskṛtam"
                subtitle={t('iast', language)}
                onPress={() => onChange({ ...preferences, scriptPreference: 'iast' })}
              />
              <ChoiceCard
                active={preferences.scriptPreference === 'both'}
                title="संस्कृतम् · saṃskṛtam"
                subtitle={t('both', language)}
                onPress={() => onChange({ ...preferences, scriptPreference: 'both' })}
              />
            </>
          ) : null}
          {step === 3
            ? (Object.keys(levelLabels) as Level[]).map((item) => (
                <ChoiceCard
                  key={item}
                  active={preferences.level === item}
                  title={levelLabels[item][language]}
                  onPress={() => onChange({ ...preferences, level: item })}
                />
              ))
            : null}
        </View>
      </ScrollView>
      <View style={styles.onboardingFooter}>
        {Platform.OS === 'web' && step === 0 ? (
          <Pressable accessibilityRole="button" onPress={onTryLocalTutor} style={styles.finishButton}>
            <Text style={styles.finishButtonText}>{localCopy[language].title} →</Text>
          </Pressable>
        ) : null}
        {Platform.OS === 'web' && step === 0 ? (
          <Pressable accessibilityRole="button" onPress={onTryTranscription} style={styles.finishButton}>
            <Text style={styles.finishButtonText}>{speechCopy[language].title} →</Text>
          </Pressable>
        ) : null}
        <View style={styles.steps}>
          {[0, 1, 2, 3].map((item) => (
            <View key={item} style={[styles.step, item === step && styles.stepActive]} />
          ))}
        </View>
        <Pressable
          testID="onboarding-continue"
          accessibilityRole="button"
          style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
          onPress={() => {
            if (step < 3) setStep((value) => value + 1);
            else onComplete(preferences);
          }}
        >
          <Text style={styles.primaryButtonText}>{t(step === 3 ? 'begin' : 'continue', language)}</Text>
          <Text style={styles.primaryButtonArrow}>→</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Header({ streak }: { streak: number }) {
  return (
    <View style={styles.header}>
      <View style={styles.brandRow}>
        <View style={styles.brandMark}><Text style={styles.brandMarkText}>व</Text></View>
        <View>
          <Text style={styles.brand}>VĀKYA</Text>
          <Text style={styles.brandSanskrit}>संस्कृतम्</Text>
        </View>
      </View>
      <View style={styles.streak}>
        <Text style={styles.streakFlame}>◆</Text>
        <Text style={styles.streakText}>{streak}</Text>
      </View>
    </View>
  );
}

function LessonCard({
  lesson,
  language,
  completed,
  locked,
  onPress,
}: {
  lesson: Lesson;
  language: SupportLanguage;
  completed: boolean;
  locked: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={locked}
      testID={`lesson-${lesson.id}`}
      onPress={onPress}
      style={({ pressed }) => [styles.lessonCard, locked && styles.locked, pressed && !locked && styles.pressed]}
    >
      <View style={[styles.lessonGlyph, { backgroundColor: lesson.color }]}>
        <Text style={styles.lessonGlyphText}>{lesson.icon}</Text>
      </View>
      <View style={styles.flex}>
        <View style={styles.lessonMeta}>
          <Text style={styles.lessonNumber}>{t('lesson', language)} {lesson.number}</Text>
          <Text style={styles.lessonDuration}>{lesson.duration} {t('minutes', language)}</Text>
        </View>
        <Text style={styles.lessonTitle}>{lesson.title[language]}</Text>
        <Text style={styles.lessonSubtitle}>{lesson.subtitle[language]}</Text>
      </View>
      <View style={[styles.lessonState, completed && styles.lessonStateDone]}>
        <Text style={[styles.lessonStateText, completed && styles.lessonStateTextDone]}>
          {locked ? '·' : completed ? '✓' : '›'}
        </Text>
      </View>
    </Pressable>
  );
}

function LearnScreen({
  preferences,
  onOpenLesson,
}: {
  preferences: Preferences;
  onOpenLesson: (lesson: Lesson) => void;
}) {
  const completed = preferences.completedLessonIds.length;
  const nextIndex = Math.min(completed, lessons.length - 1);
  const nextLesson = lessons[nextIndex];
  const progress = Math.round((completed / lessons.length) * 100);
  const language = preferences.supportLanguage;

  return (
    <ScrollView contentContainerStyle={styles.screenContent} showsVerticalScrollIndicator={false}>
      <Header streak={preferences.streak} />
      <View style={styles.welcome}>
        <Text style={styles.kicker}>शुभदिनम् · {t('goodDay', language)}</Text>
        <Text style={styles.screenTitle}>
          {t('speakToday', language)}
        </Text>
      </View>

      <Pressable style={styles.featureCard} onPress={() => onOpenLesson(nextLesson)}>
        <View style={styles.featurePattern}><Text style={styles.featurePatternText}>ॐ</Text></View>
        <Text style={styles.featureEyebrow}>{t('continueLesson', language).toUpperCase()}</Text>
        <Text style={styles.featureTitle}>{nextLesson.title[language]}</Text>
        <Text style={styles.featureSanskrit}>{nextLesson.phrases[0].devanagari}</Text>
        <View style={styles.featureBottom}>
          <View style={styles.featureProgressTrack}>
            <View style={[styles.featureProgressFill, { width: `${Math.max(progress, 8)}%` }]} />
          </View>
          <View style={styles.featureButton}><Text style={styles.featureButtonText}>→</Text></View>
        </View>
      </Pressable>

      <View style={styles.sectionHeading}>
        <Text style={styles.sectionTitle}>{t('yourPath', language)}</Text>
        <Text style={styles.sectionCount}>{completed}/{lessons.length}</Text>
      </View>
      <View style={styles.lessonList}>
        {lessons.map((lesson, index) => (
          <LessonCard
            key={lesson.id}
            lesson={lesson}
            language={language}
            completed={preferences.completedLessonIds.includes(lesson.id)}
            locked={index > completed}
            onPress={() => onOpenLesson(lesson)}
          />
        ))}
      </View>
    </ScrollView>
  );
}

function PracticeScreen({
  preferences,
  onOpenLesson,
}: {
  preferences: Preferences;
  onOpenLesson: (lesson: Lesson) => void;
}) {
  const language = preferences.supportLanguage;
  return (
    <ScrollView contentContainerStyle={styles.screenContent}>
      <Header streak={preferences.streak} />
      <Text style={styles.kicker}>{t('freePractice', language)} · मुक्ताभ्यासः</Text>
      <Text style={styles.screenTitle}>{t('chooseConversation', language)}</Text>
      <Text style={styles.lead}>{t('practiceBody', language)}</Text>
      <LocalSpeechPanel language={language} />
      <View style={styles.practiceGrid}>
        {lessons.map((lesson) => (
          <Pressable key={lesson.id} style={styles.practiceCard} onPress={() => onOpenLesson(lesson)}>
            <View style={[styles.practiceIcon, { backgroundColor: lesson.color }]}>
              <Text style={styles.practiceIconText}>{lesson.icon}</Text>
            </View>
            <Text style={styles.practiceTitle}>{lesson.title[language]}</Text>
            <Text style={styles.practiceSub}>{lesson.phrases[0].devanagari}</Text>
            <Text style={styles.practiceAction}>{t('start', language)}  →</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

function ProgressScreen({ preferences }: { preferences: Preferences }) {
  const language = preferences.supportLanguage;
  const completed = preferences.completedLessonIds.length;
  const percent = Math.round((completed / lessons.length) * 100);
  return (
    <ScrollView contentContainerStyle={styles.screenContent}>
      <Header streak={preferences.streak} />
      <Text style={styles.kicker}>{t('journey', language)} · अध्ययनयात्रा</Text>
      <Text style={styles.screenTitle}>{t('progressTitle', language)}</Text>
      <View style={styles.progressHero}>
        <View style={styles.progressRing}>
          <Text style={styles.progressPercent}>{percent}%</Text>
          <Text style={styles.progressLabel}>{t('complete', language)}</Text>
        </View>
        <View style={styles.progressStats}>
          <Text style={styles.statValue}>{completed}</Text>
          <Text style={styles.statLabel}>{t('lessonsFinished', language)}</Text>
          <View style={styles.statRule} />
          <Text style={styles.statValue}>{preferences.streak}</Text>
          <Text style={styles.statLabel}>{t('streak', language)}</Text>
        </View>
      </View>
      <Text style={styles.sectionTitle}>{t('phrasesMet', language)}</Text>
      {lessons
        .filter((lesson) => preferences.completedLessonIds.includes(lesson.id))
        .flatMap((lesson) => lesson.phrases.slice(0, 1))
        .map((phrase) => (
          <View key={phrase.devanagari} style={styles.phraseRow}>
            <View>
              <Text style={styles.phraseText}>{phrase.devanagari}</Text>
              <Text style={styles.phraseIast}>{phrase.iast}</Text>
            </View>
            <Text style={styles.check}>✓</Text>
          </View>
        ))}
      {completed === 0 ? <Text style={styles.emptyText}>{t('emptyProgress', language)}</Text> : null}
    </ScrollView>
  );
}

function SettingsScreen({
  preferences,
  onChange,
  onReset,
}: {
  preferences: Preferences;
  onChange: (next: Preferences) => void;
  onReset: () => void;
}) {
  const language = preferences.supportLanguage;
  return (
    <ScrollView contentContainerStyle={styles.screenContent}>
      <Header streak={preferences.streak} />
      <Text style={styles.kicker}>{t('personalise', language)} · अनुकूलनम्</Text>
      <Text style={styles.screenTitle}>{t('settingsTitle', language)}</Text>
      <Text style={styles.settingLabel}>{t('supportLanguage', language)}</Text>
      <View style={styles.chipRow}>
        {(Object.keys(languageNames) as SupportLanguage[]).map((language) => (
          <Pressable
            key={language}
            onPress={() => onChange({ ...preferences, supportLanguage: language })}
            style={[styles.chip, preferences.supportLanguage === language && styles.chipActive]}
          >
            <Text style={[styles.chipText, preferences.supportLanguage === language && styles.chipTextActive]}>
              {languageNames[language]}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.settingLabel}>{t('script', language)}</Text>
      <View style={styles.settingsGroup}>
        {(['devanagari', 'iast', 'both'] as ScriptPreference[]).map((script) => (
          <ChoiceCard
            key={script}
            active={preferences.scriptPreference === script}
            title={script === 'devanagari' ? 'संस्कृतम्' : script === 'iast' ? 'saṃskṛtam' : 'संस्कृतम् · saṃskṛtam'}
            subtitle={t(script, language)}
            onPress={() => onChange({ ...preferences, scriptPreference: script })}
          />
        ))}
      </View>
      <Text style={styles.settingLabel}>{t('level', language)}</Text>
      <View style={styles.settingsGroup}>
        {(Object.keys(levelLabels) as Level[]).map((level) => (
          <ChoiceCard
            key={level}
            active={preferences.level === level}
            title={levelLabels[level][preferences.supportLanguage]}
            onPress={() => onChange({ ...preferences, level })}
          />
        ))}
      </View>
      <Pressable style={styles.resetButton} onPress={onReset}>
        <Text style={styles.resetButtonText}>{t('reset', language)}</Text>
      </Pressable>
    </ScrollView>
  );
}

function LessonScreen({
  lesson,
  preferences,
  onClose,
  onComplete,
}: {
  lesson: Lesson;
  preferences: Preferences;
  onClose: () => void;
  onComplete: () => void;
}) {
  const language = preferences.supportLanguage;
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [messages, setMessages] = useState<TutorMessage[]>([
    { ...initialTutorMessage, support: lesson.subtitle[language] },
  ]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<keyof typeof import('./src/content').ui | null>(null);
  const [showReference, setShowReference] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [sourceLanguage, setSourceLanguage] = useState<SourceLanguage>('sa');

  async function playSpeech(id: string, text: string, rate = 0.8) {
    if (speakingId) return;
    setError(null);
    setSpeakingId(id);
    try {
      await speakSanskrit(text, rate);
    } catch (reason) {
      console.error('Sanskrit speech failed', reason);
      setError('speechError');
    } finally {
      setSpeakingId(null);
    }
  }

  async function submitMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;
    const learnerMessage: TutorMessage = { id: `learner-${Date.now()}`, role: 'learner', sanskrit: trimmed };
    const nextMessages = [...messages, learnerMessage];
    setMessages(nextMessages);
    setInput('');
    setError(null);
    setIsSending(true);
    try {
      const response = await askTutor({
        supportLanguage: language,
        level: preferences.level,
        lessonId: lesson.id,
        message: trimmed,
        history: messages.slice(-6),
        sourceLanguage,
      });
      const tutorMessage: TutorMessage = {
        id: `tutor-${Date.now()}`,
        role: 'tutor',
        ...response,
        supportLanguage: language,
      };
      setMessages((current) => [...current, tutorMessage]);
      void playSpeech(tutorMessage.id, response.sanskrit, 0.82);
    } catch (reason) {
      console.error('Tutor request failed', reason);
      setError(reason instanceof TutorApiUnavailableError ? 'tutorConfig' : 'tutorError');
    } finally {
      setIsSending(false);
    }
  }

  async function toggleRecording() {
    if (isRecording) {
      setIsRecording(false);
      setIsSending(true);
      setError(null);
      try {
        await recorder.stop();
        if (!recorder.uri) throw new Error('No recording was captured.');
        const text = await transcribeAudio(recorder.uri);
        await submitMessage(text);
      } catch (reason) {
        console.error('Recording transcription failed', reason);
        setError('recordingError');
      } finally {
        setIsSending(false);
      }
      return;
    }

    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setError('microphoneError');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setIsRecording(true);
    } catch (reason) {
      console.error('Microphone could not start', reason);
      setError('microphoneError');
    }
  }

  return (
    <View style={styles.lessonScreen}>
      <StatusBar style="dark" />
      <View style={styles.lessonHeader}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('close', language)} onPress={onClose} style={styles.closeButton}><Text style={styles.closeText}>×</Text></Pressable>
        <View style={styles.lessonHeaderCenter}>
          <Text style={styles.lessonHeaderKicker}>{t('lesson', language)} {lesson.number}</Text>
          <Text style={styles.lessonHeaderTitle}>{lesson.title[language]}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={t('reference', language)} onPress={() => setShowReference((value) => !value)} style={styles.referenceButton}>
          <Text style={styles.referenceButtonText}>अ</Text>
        </Pressable>
      </View>

      {showReference ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.referenceStrip} contentContainerStyle={styles.referenceContent}>
          {lesson.phrases.map((phrase) => (
            <Pressable
              key={phrase.devanagari}
              disabled={speakingId !== null}
              style={styles.referencePhrase}
              onPress={() => void playSpeech(`reference-${phrase.devanagari}`, phrase.devanagari, 0.78)}
            >
              <Text style={styles.referenceSanskrit}>{phrase.devanagari}</Text>
              <Text style={styles.referenceMeaning}>{phrase.meaning[language]}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={8}>
        <ScrollView style={styles.chat} contentContainerStyle={styles.chatContent}>
          <View style={styles.tutorIntro}>
            <View style={styles.tutorAvatar}><Text style={styles.tutorAvatarText}>व</Text></View>
            <View>
              <Text style={styles.tutorName}>VĀKYA</Text>
              <Text style={styles.tutorStatus}>{t('tutorStatus', language)}</Text>
            </View>
          </View>
          {messages.map((message) => (
            <View key={message.id} style={[styles.message, message.role === 'learner' ? styles.learnerMessage : styles.tutorMessage]}>
              {message.sanskrit ? (
                <Text style={[styles.messageSanskrit, message.role === 'learner' && styles.learnerMessageText]}>{message.sanskrit}</Text>
              ) : null}
              {message.role === 'tutor' && preferences.scriptPreference !== 'devanagari' && message.transliteration ? (
                <Text style={styles.messageIast}>{message.transliteration}</Text>
              ) : null}
              {message.role === 'tutor' && message.support ? (
                <Text style={styles.messageSupport}>{message.id === 'welcome' ? lesson.subtitle[language] : message.support}</Text>
              ) : null}
              {message.role === 'tutor' && message.supportLanguage && message.supportLanguage !== language ? (
                <Text style={styles.messageSupport}>{t('previousReply', language)}</Text>
              ) : null}
              {message.role === 'tutor' && message.sanskrit ? (
                <View style={styles.messageActions}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={speakingId !== null}
                    onPress={() => void playSpeech(message.id, message.sanskrit!)}
                  >
                    {speakingId === message.id
                      ? <ActivityIndicator color={colors.leaf} size="small" />
                      : <Text style={styles.messageAction}>◖ {t('listen', language)}</Text>}
                  </Pressable>
                </View>
              ) : null}
            </View>
          ))}
          {isSending ? (
            <View style={[styles.message, styles.tutorMessage, styles.typingMessage]}>
              <ActivityIndicator color={colors.saffron} />
              <Text style={styles.typingText}>{t('thinking', language)}</Text>
            </View>
          ) : null}
          {error ? <Text accessibilityRole="alert" style={styles.errorText}>{t(error, language)}</Text> : null}
          <LocalSpeechPanel language={language} onUseTranscript={(value) => { setInput(value); setSourceLanguage('sa'); }} />
        </ScrollView>

        <View style={styles.composerWrap}>
          {usingHostedTutor && <Text style={styles.promptHintText}>{localCopy[language].experimental_conversation} {localCopy[language].machine_translation}</Text>}
          {usingHostedTutor && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            <Text>{localCopy[language].source}</Text>
            {(['sa', 'en', 'hi', 'te'] as SourceLanguage[]).map((source) => <Pressable key={source} accessibilityRole="radio" accessibilityState={{ checked: sourceLanguage === source }} disabled={isSending} onPress={() => setSourceLanguage(source)}>
              <Text style={{ fontWeight: sourceLanguage === source ? '700' : '400' }}>{source === 'sa' ? 'संस्कृतम्' : languageNames[source]}</Text>
            </Pressable>)}
          </View>}
          <View style={styles.promptHint}>
            <Text style={styles.promptHintText}>{t('try', language)} {lesson.phrases[Math.min(messages.length - 1, lesson.phrases.length - 1)].devanagari}</Text>
          </View>
          <View style={styles.composer}>
            <TextInput
              testID="tutor-input"
              value={input}
              editable={!isSending}
              onChangeText={setInput}
              onSubmitEditing={() => submitMessage(input)}
              placeholder={t('typeReply', language)}
              placeholderTextColor="#9A9389"
              style={styles.input}
              returnKeyType="send"
            />
            {Platform.OS !== 'web' ? <Pressable
              accessibilityLabel={t(isRecording ? 'stopRecording' : 'startRecording', language)}
              disabled={isSending}
              onPress={toggleRecording}
              style={[styles.micButton, isRecording && styles.micButtonRecording]}
            >
              <Text style={styles.micText}>{isRecording ? '■' : '●'}</Text>
            </Pressable> : null}
            {input.trim() ? (
              <Pressable accessibilityRole="button" accessibilityLabel={t('send', language)} testID="send-message" onPress={() => submitMessage(input)} style={styles.sendButton}>
                <Text style={styles.sendText}>↑</Text>
              </Pressable>
            ) : null}
          </View>
          <Pressable testID="finish-lesson" onPress={onComplete} style={styles.finishButton}>
            <Text style={styles.finishButtonText}>{t('finish', language)}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function BottomNav({ screen, language, onChange }: { screen: Screen; language: SupportLanguage; onChange: (screen: Screen) => void }) {
  const items: Array<{ id: Screen; icon: string; label: keyof typeof import('./src/content').ui }> = [
    { id: 'learn', icon: 'अ', label: 'home' },
    { id: 'practice', icon: '◉', label: 'practice' },
    { id: 'local', icon: '⌂', label: 'local' },
    { id: 'progress', icon: '↗', label: 'progress' },
    { id: 'settings', icon: '☷', label: 'settings' },
  ];
  return (
    <View style={styles.bottomNav}>
      {items.map((item) => (
        <Pressable key={item.id} testID={`nav-${item.id}`} style={styles.navItem} onPress={() => onChange(item.id)}>
          <Text style={[styles.navIcon, screen === item.id && styles.navActive]}>{item.icon}</Text>
          <Text style={[styles.navLabel, screen === item.id && styles.navActive]}>{item.id === 'local' && usingHostedTutor ? localCopy[language].title : t(item.label, language)}</Text>
          {screen === item.id ? <View style={styles.navDot} /> : null}
        </Pressable>
      ))}
    </View>
  );
}

export default function App() {
  const { width } = useWindowDimensions();
  const [loading, setLoading] = useState(true);
  const [onboarded, setOnboarded] = useState(false);
  const [preferences, setPreferences] = useState(defaultPreferences);
  const [screen, setScreen] = useState<Screen>('learn');
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);
  const [standaloneMode, setStandaloneMode] = useState(() =>
    Platform.OS === 'web' && typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('mode') : null);

  useEffect(() => {
    Promise.all([loadPreferences(), loadLanguage()])
      .then(([stored, savedLanguage]) => {
        const urlLanguage = Platform.OS === 'web' ? languageFromUrl(new URL(window.location.href)) : null;
        setPreferences({
          ...(stored ?? defaultPreferences),
          supportLanguage: urlLanguage ?? savedLanguage ?? stored?.supportLanguage ?? 'en',
        });
        if (stored) {
          setOnboarded(true);
        }
      })
      .catch((error: unknown) => {
        console.error('Failed to load preferences', error);
        const urlLanguage = Platform.OS === 'web' ? languageFromUrl(new URL(window.location.href)) : null;
        setPreferences({ ...defaultPreferences, supportLanguage: urlLanguage ?? 'en' });
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (loading) return;
    const language = preferences.supportLanguage;
    void saveLanguage(language).catch((error: unknown) => console.error('Failed to save language', error));
    if (Platform.OS === 'web') {
      document.documentElement.lang = language;
      window.history.replaceState(window.history.state, '', urlWithLanguage(new URL(window.location.href), language));
    }
  }, [loading, preferences.supportLanguage]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onPopState = () => {
      const url = new URL(window.location.href);
      const language = languageFromUrl(url);
      if (language) setPreferences((current) => ({ ...current, supportLanguage: language }));
      setStandaloneMode(url.searchParams.get('mode'));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  function changeStandalone(mode: 'transcribe' | 'tutor' | null) {
    setStandaloneMode(mode);
    if (Platform.OS === 'web') {
      const url = new URL(window.location.href);
      if (mode) url.searchParams.set('mode', mode);
      else url.searchParams.delete('mode');
      window.history.replaceState(window.history.state, '', url);
    }
  }

  async function persist(next: Preferences) {
    setPreferences(next);
    try {
      await savePreferences(next);
    } catch (error) {
      console.error('Failed to save preferences', error);
    }
  }

  function renderScreen() {
    if (screen === 'local') return (
      <ScrollView contentContainerStyle={styles.screenContent}>
        <Header streak={preferences.streak} />
        <LocalTutorPanel language={preferences.supportLanguage} level={preferences.level} />
      </ScrollView>
    );
    if (screen === 'practice') return <PracticeScreen preferences={preferences} onOpenLesson={setActiveLesson} />;
    if (screen === 'progress') return <ProgressScreen preferences={preferences} />;
    if (screen === 'settings') {
      return (
        <SettingsScreen
          preferences={preferences}
          onChange={persist}
          onReset={() => {
            setOnboarded(false);
            setPreferences({ ...defaultPreferences, supportLanguage: preferences.supportLanguage });
          }}
        />
      );
    }
    return <LearnScreen preferences={preferences} onOpenLesson={setActiveLesson} />;
  }

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator size="large" color={colors.saffron} /></View>;
  }

  function renderContent() {
    if (standaloneMode === 'transcribe' || standaloneMode === 'tutor') {
      return (
        <View style={styles.flex}>
          <StatusBar style="dark" />
          <ScrollView contentContainerStyle={[styles.screenContent, { maxWidth: 820, width: '100%', alignSelf: 'center' }]}>
            <Header streak={preferences.streak} />
            <Pressable accessibilityRole="button" onPress={() => changeStandalone(null)} style={styles.finishButton}>
              <Text style={styles.finishButtonText}>← VĀKYA</Text>
            </Pressable>
            {standaloneMode === 'tutor'
              ? <LocalTutorPanel language={preferences.supportLanguage} level={preferences.level} />
              : <LocalSpeechPanel language={preferences.supportLanguage} />}
          </ScrollView>
        </View>
      );
    }

    if (!onboarded) {
      return (
        <Onboarding
          preferences={preferences}
          onChange={setPreferences}
          onTryTranscription={() => changeStandalone('transcribe')}
          onTryLocalTutor={() => changeStandalone('tutor')}
          onComplete={(next) => {
            persist(next);
            setOnboarded(true);
          }}
        />
      );
    }

    if (activeLesson) {
      return (
        <LessonScreen
          lesson={activeLesson}
          preferences={preferences}
          onClose={() => setActiveLesson(null)}
          onComplete={() => {
            const ids = preferences.completedLessonIds.includes(activeLesson.id)
              ? preferences.completedLessonIds
              : [...preferences.completedLessonIds, activeLesson.id];
            persist({ ...preferences, completedLessonIds: ids });
            setActiveLesson(null);
          }}
        />
      );
    }

    return (
      <View style={styles.flex}>
        <StatusBar style="dark" />
        <View style={[styles.appFrame, width > 820 && styles.appFrameWide]}>
          {renderScreen()}
          <BottomNav screen={screen} language={preferences.supportLanguage} onChange={setScreen} />
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.app}>
      <LanguageSelector
        language={preferences.supportLanguage}
        onChange={(language) => {
          const next = { ...preferences, supportLanguage: language };
          if (onboarded) void persist(next);
          else setPreferences(next);
        }}
      />
      {renderContent()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  app: { flex: 1, backgroundColor: colors.cream, paddingTop: Platform.OS === 'android' ? NativeStatusBar.currentHeight : 0 },
  appFrame: { flex: 1, width: '100%', alignSelf: 'center', backgroundColor: colors.cream },
  appFrameWide: { maxWidth: 820, borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.line },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cream },
  languageBar: { width: '100%', maxWidth: 820, alignSelf: 'center', paddingHorizontal: 24, paddingVertical: 10, gap: 8, borderBottomWidth: 1, borderColor: colors.line },
  languageLabel: { fontSize: 12, color: colors.muted, fontWeight: '700' },
  onboarding: { flex: 1, backgroundColor: colors.cream },
  onboardingTop: { minHeight: 56, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  onboardingContent: { flexGrow: 1, width: '100%', maxWidth: 620, alignSelf: 'center', paddingHorizontal: 26, paddingTop: 32, paddingBottom: 24, justifyContent: 'center' },
  onboardingFooter: { width: '100%', maxWidth: 620, alignSelf: 'center', padding: 24, paddingBottom: Platform.OS === 'ios' ? 12 : 24 },
  eyebrow: { color: colors.saffron, fontSize: 12, fontWeight: '800', letterSpacing: 2 },
  back: { fontSize: 14, color: colors.muted, fontWeight: '600' },
  heroMark: { width: 150, height: 150, borderRadius: 75, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F0E0CD', marginBottom: 38 },
  heroMarkText: { fontSize: 78, color: colors.saffronDark, fontFamily: Platform.select({ ios: 'Georgia', default: 'serif' }) },
  heroOrbit: { position: 'absolute', width: 180, height: 90, borderWidth: 1, borderColor: colors.saffron, borderRadius: 90, transform: [{ rotate: '-24deg' }] },
  displayTitle: { color: colors.ink, fontSize: 38, lineHeight: 46, fontWeight: '700', fontFamily: Platform.select({ ios: 'Georgia', default: 'serif' }), marginBottom: 16 },
  centerText: { textAlign: 'center' },
  lead: { color: colors.muted, fontSize: 17, lineHeight: 26, marginBottom: 28 },
  choices: { gap: 12, marginTop: 8 },
  choiceCard: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18, paddingVertical: 14, borderWidth: 1, borderColor: colors.line, borderRadius: 14, backgroundColor: colors.paper },
  choiceCardActive: { borderColor: colors.saffron, backgroundColor: '#FFF7F1' },
  choiceDot: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: '#ACA498', alignItems: 'center', justifyContent: 'center' },
  choiceDotActive: { borderColor: colors.saffron },
  choiceDotInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.saffron },
  choiceTitle: { color: colors.ink, fontSize: 18, fontWeight: '600' },
  choiceTitleActive: { color: colors.saffronDark },
  choiceSubtitle: { color: colors.muted, fontSize: 13, marginTop: 3 },
  steps: { flexDirection: 'row', justifyContent: 'center', gap: 7, marginBottom: 18 },
  step: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#D4CABC' },
  stepActive: { width: 24, backgroundColor: colors.saffron },
  primaryButton: { height: 58, borderRadius: 14, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.saffron },
  primaryButtonText: { color: colors.white, fontSize: 17, fontWeight: '700' },
  primaryButtonArrow: { color: colors.white, fontSize: 24 },
  pressed: { opacity: 0.75, transform: [{ scale: 0.99 }] },
  screenContent: { paddingHorizontal: 22, paddingBottom: 116 },
  header: { height: 82, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.saffron },
  brandMarkText: { color: colors.white, fontSize: 23, fontWeight: '600' },
  brand: { color: colors.ink, fontSize: 15, fontWeight: '900', letterSpacing: 2.5 },
  brandSanskrit: { color: colors.muted, fontSize: 11, marginTop: -1 },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
  streakFlame: { color: colors.saffron, fontSize: 14 },
  streakText: { color: colors.ink, fontWeight: '800' },
  welcome: { marginTop: 16, marginBottom: 24 },
  kicker: { color: colors.saffron, fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginBottom: 10 },
  screenTitle: { color: colors.ink, fontFamily: Platform.select({ ios: 'Georgia', default: 'serif' }), fontSize: 32, lineHeight: 39, fontWeight: '700', maxWidth: 560, marginBottom: 10 },
  featureCard: { minHeight: 245, borderRadius: 24, padding: 24, backgroundColor: colors.leaf, overflow: 'hidden', marginBottom: 30 },
  featurePattern: { position: 'absolute', right: -25, top: -35, width: 185, height: 185, borderWidth: 1, borderColor: '#708474', borderRadius: 93, alignItems: 'center', justifyContent: 'center' },
  featurePatternText: { color: '#708474', fontSize: 100 },
  featureEyebrow: { color: '#D7E2D7', fontWeight: '800', fontSize: 11, letterSpacing: 1.5, marginBottom: 22 },
  featureTitle: { color: colors.white, fontFamily: Platform.select({ ios: 'Georgia', default: 'serif' }), fontWeight: '700', fontSize: 27, maxWidth: '75%' },
  featureSanskrit: { color: '#E7EFD5', fontSize: 18, marginTop: 8 },
  featureBottom: { marginTop: 'auto', flexDirection: 'row', alignItems: 'center', gap: 16 },
  featureProgressTrack: { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: '#718577' },
  featureProgressFill: { height: '100%', backgroundColor: '#EFAB6E' },
  featureButton: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.saffron },
  featureButtonText: { color: colors.white, fontSize: 24 },
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sectionTitle: { color: colors.ink, fontSize: 19, fontWeight: '800' },
  sectionCount: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  lessonList: { gap: 12 },
  lessonCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  locked: { opacity: 0.48 },
  lessonGlyph: { width: 58, height: 68, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  lessonGlyphText: { color: colors.white, fontSize: 29, fontWeight: '700' },
  lessonMeta: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  lessonNumber: { color: colors.saffron, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  lessonDuration: { color: colors.muted, fontSize: 10 },
  lessonTitle: { color: colors.ink, fontSize: 17, fontWeight: '700', marginBottom: 4 },
  lessonSubtitle: { color: colors.muted, fontSize: 12 },
  lessonState: { width: 27, height: 27, borderRadius: 14, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  lessonStateDone: { backgroundColor: colors.leafLight, borderColor: colors.leafLight },
  lessonStateText: { color: colors.muted, fontSize: 18 },
  lessonStateTextDone: { color: colors.leaf, fontSize: 13, fontWeight: '900' },
  practiceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10 },
  practiceCard: { flexGrow: 1, flexBasis: 260, minHeight: 210, padding: 20, borderRadius: 18, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line },
  practiceIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  practiceIconText: { color: colors.white, fontSize: 24, fontWeight: '700' },
  practiceTitle: { color: colors.ink, fontSize: 19, fontWeight: '800' },
  practiceSub: { color: colors.muted, fontSize: 15, marginTop: 6 },
  practiceAction: { color: colors.saffron, fontSize: 11, fontWeight: '900', letterSpacing: 1.2, marginTop: 'auto' },
  progressHero: { padding: 24, marginVertical: 20, borderRadius: 22, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  progressRing: { width: 132, height: 132, borderRadius: 66, borderWidth: 11, borderColor: colors.saffron, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cream },
  progressPercent: { fontSize: 30, fontWeight: '800', color: colors.ink },
  progressLabel: { fontSize: 9, letterSpacing: 1.4, color: colors.muted, fontWeight: '800' },
  progressStats: { minWidth: 130 },
  statValue: { color: colors.ink, fontSize: 26, fontWeight: '800' },
  statLabel: { color: colors.muted, fontSize: 12 },
  statRule: { height: 1, backgroundColor: colors.line, marginVertical: 14 },
  phraseRow: { marginTop: 12, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  phraseText: { color: colors.ink, fontSize: 20, fontWeight: '600' },
  phraseIast: { color: colors.muted, fontSize: 13, marginTop: 4 },
  check: { color: colors.leaf, fontWeight: '900' },
  emptyText: { color: colors.muted, marginTop: 18, fontSize: 15, fontStyle: 'italic' },
  settingLabel: { color: colors.muted, fontSize: 10, fontWeight: '900', letterSpacing: 1.5, marginTop: 28, marginBottom: 12 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  chip: { borderWidth: 1, borderColor: colors.line, paddingHorizontal: 17, paddingVertical: 11, borderRadius: 22, backgroundColor: colors.paper },
  chipActive: { backgroundColor: colors.saffron, borderColor: colors.saffron },
  chipText: { color: colors.ink, fontWeight: '600' },
  chipTextActive: { color: colors.white },
  settingsGroup: { gap: 9 },
  resetButton: { marginTop: 34, borderWidth: 1, borderColor: '#D5A49B', padding: 15, borderRadius: 12, alignItems: 'center' },
  resetButtonText: { color: colors.error, fontWeight: '700' },
  bottomNav: { position: 'absolute', left: 14, right: 14, bottom: Platform.OS === 'ios' ? 12 : 14, height: 72, borderRadius: 20, paddingHorizontal: 8, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, flexDirection: 'row', shadowColor: '#493C2B', shadowOpacity: 0.1, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  navIcon: { color: '#8B8379', fontSize: 20, fontWeight: '700' },
  navLabel: { color: '#8B8379', fontSize: 10, fontWeight: '700' },
  navActive: { color: colors.saffronDark },
  navDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.saffron, marginTop: 1 },
  lessonScreen: { flex: 1, backgroundColor: colors.cream },
  lessonHeader: { height: 72, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, borderBottomWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  closeButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line },
  closeText: { color: colors.ink, fontSize: 28, fontWeight: '300', marginTop: -3 },
  lessonHeaderCenter: { flex: 1, alignItems: 'center' },
  lessonHeaderKicker: { color: colors.saffron, fontSize: 8, fontWeight: '900', letterSpacing: 1.3 },
  lessonHeaderTitle: { color: colors.ink, fontSize: 16, fontWeight: '700', marginTop: 3 },
  referenceButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.leafLight },
  referenceButtonText: { color: colors.leaf, fontSize: 20, fontWeight: '700' },
  referenceStrip: { flexGrow: 0, borderBottomWidth: 1, borderColor: colors.line, backgroundColor: '#F2EADD' },
  referenceContent: { padding: 10, gap: 9 },
  referencePhrase: { minWidth: 180, backgroundColor: colors.paper, padding: 12, borderRadius: 10 },
  referenceSanskrit: { color: colors.ink, fontWeight: '700', fontSize: 16 },
  referenceMeaning: { color: colors.muted, fontSize: 11, marginTop: 4 },
  chat: { flex: 1 },
  chatContent: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 20, paddingBottom: 30 },
  tutorIntro: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 24 },
  tutorAvatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.saffron },
  tutorAvatarText: { color: colors.white, fontSize: 22, fontWeight: '700' },
  tutorName: { color: colors.ink, fontSize: 13, fontWeight: '900', letterSpacing: 1.5 },
  tutorStatus: { color: colors.leaf, fontSize: 8, fontWeight: '800', letterSpacing: 1.1, marginTop: 2 },
  message: { maxWidth: '88%', padding: 16, borderRadius: 17, marginBottom: 14 },
  tutorMessage: { alignSelf: 'flex-start', backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderTopLeftRadius: 4 },
  learnerMessage: { alignSelf: 'flex-end', backgroundColor: colors.leaf, borderTopRightRadius: 4 },
  messageSanskrit: { color: colors.ink, fontSize: 21, lineHeight: 30, fontWeight: '600' },
  learnerMessageText: { color: colors.white },
  messageIast: { color: colors.saffronDark, fontSize: 14, fontStyle: 'italic', marginTop: 5 },
  messageSupport: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.line },
  messageActions: { flexDirection: 'row', marginTop: 11 },
  messageAction: { color: colors.leaf, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  typingMessage: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  typingText: { color: colors.muted, fontSize: 12 },
  errorText: { color: colors.error, backgroundColor: '#F8E7E4', padding: 12, borderRadius: 10, fontSize: 12 },
  composerWrap: { backgroundColor: colors.paper, borderTopWidth: 1, borderColor: colors.line, paddingHorizontal: 14, paddingTop: 8, paddingBottom: Platform.OS === 'ios' ? 8 : 14 },
  promptHint: { alignItems: 'center', marginBottom: 7 },
  promptHintText: { color: colors.muted, fontSize: 11 },
  composer: { maxWidth: 760, width: '100%', alignSelf: 'center', minHeight: 52, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.cream, borderWidth: 1, borderColor: colors.line, borderRadius: 26, paddingLeft: 18, paddingRight: 5, gap: 7 },
  input: { flex: 1, minHeight: 48, color: colors.ink, fontSize: 16, outlineStyle: 'none' } as never,
  micButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.saffron },
  micButtonRecording: { backgroundColor: colors.error },
  micText: { color: colors.white, fontSize: 13 },
  sendButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.leaf },
  sendText: { color: colors.white, fontSize: 23, fontWeight: '800' },
  finishButton: { alignSelf: 'center', marginTop: 8 },
  finishButtonText: { color: colors.saffronDark, fontSize: 11, fontWeight: '800', textDecorationLine: 'underline' },
});

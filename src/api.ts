import { Level, SupportLanguage, TutorMessage } from './types';

const apiBaseUrl = process.env.EXPO_PUBLIC_API_URL ?? '';

type TutorRequest = {
  supportLanguage: SupportLanguage;
  level: Level;
  lessonId: string;
  message: string;
  history: TutorMessage[];
};

type TutorResponse = {
  sanskrit: string;
  transliteration: string;
  support: string;
};

export class TutorApiUnavailableError extends Error {}

export async function askTutor(request: TutorRequest): Promise<TutorResponse> {
  const response = await fetch(`${apiBaseUrl}/api/tutor`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.headers.get('Content-Type')?.includes('application/json')) {
    throw new TutorApiUnavailableError('The tutor API is not available on this server. Local transcription works independently; configure EXPO_PUBLIC_API_URL for AI replies.');
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error ?? `Tutor request failed (${response.status})`);
  }

  return response.json() as Promise<TutorResponse>;
}

export async function transcribeAudio(uri: string): Promise<string> {
  const formData = new FormData();
  formData.append('audio', {
    uri,
    name: 'practice.m4a',
    type: 'audio/mp4',
  } as unknown as Blob);

  const response = await fetch(`${apiBaseUrl}/api/transcribe`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error ?? `Transcription failed (${response.status})`);
  }

  const body = await response.json() as { text: string };
  return body.text;
}

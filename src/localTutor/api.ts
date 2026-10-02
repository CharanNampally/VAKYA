export type SourceLanguage = 'en' | 'hi' | 'te' | 'sa';
export type Mode = 'teach' | 'converse' | 'analyze';
export type ErrorCode = 'unreachable' | 'unauthorized' | 'forbidden_origin' | 'provider_unavailable' | 'busy' | 'quota_exceeded' | 'invalid_request' | 'invalid_output' | 'inference_failed';
export type Capabilities = {
  protocol: 1;
  translation: { 'en-indic': boolean; 'indic-en': boolean; 'indic-indic': boolean };
  analysis: boolean;
  conversation: boolean;
  speech: boolean;
  sources: SourceLanguage[];
};
export type HistoryItem = { role: 'user' | 'assistant'; content: string };
export type LocalResult = {
  sanskrit?: string;
  transliteration?: string;
  support?: string;
  provider: string;
  warnings: Array<'machine_translation' | 'transliteration_only' | 'candidate_analysis' | 'experimental_conversation'>;
  words?: Array<{ word: string; candidates: Array<{ root: string; tags: string[] }> }>;
  history?: HistoryItem[];
};
export class CompanionError extends Error {
  constructor(public readonly code: ErrorCode) { super(code); }
}
const hostedOrigin = process.env.EXPO_PUBLIC_TUTOR_API_URL?.replace(/\/+$/, '') ?? '';
const localRequested = typeof window !== 'undefined' && window.location
  ? new URLSearchParams(window.location.search).get('service') === 'local' : false;
export const usingHostedTutor = !!hostedOrigin && !localRequested;
const endpoint = usingHostedTutor ? `${hostedOrigin}/v1` : 'http://127.0.0.1:8765/v1';
const errors: ErrorCode[] = ['unauthorized', 'forbidden_origin', 'provider_unavailable', 'busy', 'quota_exceeded', 'invalid_request', 'invalid_output', 'inference_failed'];
const sources: SourceLanguage[] = ['en', 'hi', 'te', 'sa'];
const warnings = ['machine_translation', 'transliteration_only', 'candidate_analysis', 'experimental_conversation'];
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string');

function capabilities(value: unknown): value is Capabilities {
  if (!record(value) || !record(value.translation)) return false;
  const translation = value.translation;
  return value.protocol === 1
    && ['en-indic', 'indic-en', 'indic-indic'].every((key) => typeof translation[key] === 'boolean')
    && ['analysis', 'conversation', 'speech'].every((key) => typeof value[key] === 'boolean')
    && Array.isArray(value.sources) && value.sources.every((item) => sources.includes(item));
}

function result(value: unknown): value is LocalResult {
  if (!record(value) || typeof value.provider !== 'string' || !strings(value.warnings)
      || !value.warnings.every((item) => warnings.includes(item))) return false;
  if (['sanskrit', 'transliteration', 'support'].some((key) => value[key] !== undefined && typeof value[key] !== 'string')) return false;
  if (value.history !== undefined && (!Array.isArray(value.history) || value.history.length > 6
    || !value.history.every((item) => record(item) && ['user', 'assistant'].includes(String(item.role)) && typeof item.content === 'string'))) return false;
  if (value.words !== undefined) {
    return Array.isArray(value.words) && value.words.every((word) => record(word)
      && typeof word.word === 'string' && Array.isArray(word.candidates)
      && word.candidates.every((candidate) => record(candidate) && typeof candidate.root === 'string' && strings(candidate.tags)));
  }
  return typeof value.sanskrit === 'string' && typeof value.transliteration === 'string';
}

async function request<T>(path: string, token: string, signal: AbortSignal, validate: (value: unknown) => value is T, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${endpoint}/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...(usingHostedTutor ? {} : { Authorization: `Bearer ${token}` }), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new CompanionError('unreachable');
  }
  let value: unknown;
  try { value = await response.json(); } catch { throw new CompanionError('invalid_output'); }
  if (!response.ok) {
    const code = record(value) && record(value.error) ? value.error.code : null;
    const known = errors.find((item) => item === code);
    throw new CompanionError(known ?? 'inference_failed');
  }
  if (!validate(value)) throw new CompanionError('invalid_output');
  return value;
}

export const connectCompanion = (token: string, signal: AbortSignal) =>
  request('capabilities', token, signal, capabilities);
export const runLocalTutor = (mode: Mode, token: string, signal: AbortSignal, body: unknown) =>
  request(mode, token, signal, result, body);

export function canRun(capability: Capabilities, mode: Mode, source: SourceLanguage) {
  if (mode === 'analyze') return source === 'sa' && capability.analysis;
  if (mode === 'converse') return capability.conversation;
  return source === 'sa' || capability.translation[source === 'en' ? 'en-indic' : 'indic-indic'];
}

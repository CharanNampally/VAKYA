import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

const capabilities = {
  protocol: 1, translation: { 'en-indic': true, 'indic-en': true, 'indic-indic': true },
  analysis: true, conversation: true, speech: true, sources: ['en', 'hi', 'te', 'sa'],
};

it('automatically selects the configured hosted origin without leaking a pairing token', async () => {
  vi.stubEnv('EXPO_PUBLIC_TUTOR_API_URL', 'https://tutor.example/');
  const fetch = vi.fn().mockResolvedValue(Response.json(capabilities));
  vi.stubGlobal('fetch', fetch);
  const api = await import('../../src/localTutor/api');
  expect(api.usingHostedTutor).toBe(true);
  await api.connectCompanion('local-secret-must-not-be-sent', new AbortController().signal);
  expect(fetch).toHaveBeenCalledWith('https://tutor.example/v1/capabilities', expect.objectContaining({
    headers: {},
  }));
});

it('keeps explicitly requested offline mode on loopback', async () => {
  vi.stubEnv('EXPO_PUBLIC_TUTOR_API_URL', 'https://tutor.example');
  vi.stubGlobal('window', { location: { search: '?mode=tutor&service=local&lang=te' } });
  const api = await import('../../src/localTutor/api');
  expect(api.usingHostedTutor).toBe(false);
});

it('preserves quota errors without retrying another provider', async () => {
  vi.stubEnv('EXPO_PUBLIC_TUTOR_API_URL', 'https://tutor.example');
  const fetch = vi.fn().mockResolvedValue(Response.json({ error: { code: 'quota_exceeded' } }, { status: 429 }));
  vi.stubGlobal('fetch', fetch);
  const api = await import('../../src/localTutor/api');
  await expect(api.runLocalTutor('teach', '', new AbortController().signal, {})).rejects.toMatchObject({ code: 'quota_exceeded' });
  expect(fetch).toHaveBeenCalledOnce();
});

it('routes existing lesson conversations to the hosted contract with English planner history', async () => {
  vi.stubEnv('EXPO_PUBLIC_TUTOR_API_URL', 'https://tutor.example');
  const history = [{ role: 'assistant' as const, content: 'How are you?' }];
  const output = {
    sanskrit: 'नमस्ते', transliteration: 'namaste', support: 'Hello',
    provider: 'qwen+madlad', warnings: ['experimental_conversation'], history,
  };
  const fetch = vi.fn().mockResolvedValue(Response.json(output));
  vi.stubGlobal('fetch', fetch);
  const { askTutor } = await import('../../src/api');
  await expect(askTutor({
    supportLanguage: 'te', sourceLanguage: 'en', level: 'beginner', lessonId: 'greetings',
    message: 'Hello', history: [{ id: 'previous', role: 'tutor', conversationHistory: history }],
  })).resolves.toMatchObject({ sanskrit: 'नमस्ते', conversationHistory: history });
  expect(fetch).toHaveBeenCalledWith('https://tutor.example/v1/converse', expect.objectContaining({
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: 'Hello', sourceLanguage: 'en', supportLanguage: 'te', level: 'beginner', history,
    }),
  }));
});

it('fully localizes hosted copy and error messages', async () => {
  const { hostedCopy } = await import('../../src/localTutor/copy');
  for (const copy of Object.values(hostedCopy)) {
    expect(Object.keys(copy).sort()).toEqual(Object.keys(hostedCopy.en).sort());
    for (const value of Object.values(copy)) expect(value.trim()).not.toBe('');
  }
});

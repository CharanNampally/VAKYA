import { afterEach, describe, expect, it, vi } from 'vitest';

import transcribeHandler from '../../api/transcribe';
import tutorHandler from '../../api/tutor';
import { askTutor } from '../../src/api';

const originalApiKey = process.env.OPENAI_API_KEY;

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalApiKey) process.env.OPENAI_API_KEY = originalApiKey;
  else delete process.env.OPENAI_API_KEY;
});

describe('tutor client', () => {
  const request = {
    supportLanguage: 'en',
    level: 'beginner',
    lessonId: 'greetings',
    message: 'नमस्ते',
    history: [],
  } satisfies Parameters<typeof askTutor>[0];

  it('explains when the local web server returns HTML instead of the tutor API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('<!DOCTYPE html>', { headers: { 'Content-Type': 'text/html' } }),
    ));
    await expect(askTutor(request)).rejects.toThrow('EXPO_PUBLIC_API_URL');
  });

  it('preserves successful JSON tutor replies', async () => {
    const reply = { sanskrit: 'नमस्ते', transliteration: 'namaste', support: 'Hello' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(reply)));
    await expect(askTutor(request)).resolves.toEqual(reply);
  });

  it('preserves explicit API error messages', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      Response.json({ error: 'Tutor unavailable' }, { status: 503 }),
    ));
    await expect(askTutor(request)).rejects.toThrow('Tutor unavailable');
  });
});

describe('server endpoints', () => {
  it('rejects unsupported methods', async () => {
    const response = await tutorHandler(new Request('http://localhost/api/tutor'));
    expect(response.status).toBe(405);
  });

  it('reports missing tutor configuration explicitly', async () => {
    delete process.env.OPENAI_API_KEY;
    const response = await tutorHandler(new Request('http://localhost/api/tutor', { method: 'POST' }));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining('OPENAI_API_KEY') });
  });

  it('reports missing transcription configuration explicitly', async () => {
    delete process.env.OPENAI_API_KEY;
    const response = await transcribeHandler(new Request('http://localhost/api/transcribe', { method: 'POST' }));
    expect(response.status).toBe(503);
  });
});

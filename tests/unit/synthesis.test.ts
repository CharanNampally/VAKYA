import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchSanskritSpeech } from '../../src/speech/ttsApi';

afterEach(() => vi.unstubAllGlobals());

describe('Sanskrit speech client', () => {
  it('requests WAV speech from the configured service', async () => {
    const audio = new Blob(['wav'], { type: 'audio/wav' });
    const fetch = vi.fn().mockResolvedValue(new Response(audio, {
      headers: { 'Content-Type': 'audio/wav' },
    }));
    vi.stubGlobal('fetch', fetch);

    await expect(fetchSanskritSpeech('नमस्ते', 'https://tts.example')).resolves.toEqual(audio);
    expect(fetch).toHaveBeenCalledWith('https://tts.example/v1/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'नमस्ते' }),
    });
  });

  it('preserves an explicit service error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      Response.json({ detail: 'Daily Sanskrit speech limit reached.' }, { status: 429 }),
    ));
    await expect(fetchSanskritSpeech('नमस्ते', 'https://tts.example'))
      .rejects.toThrow('Daily Sanskrit speech limit reached.');
  });

  it('reports missing configuration', async () => {
    await expect(fetchSanskritSpeech('नमस्ते', '')).rejects.toThrow('EXPO_PUBLIC_TTS_API_URL');
  });
});

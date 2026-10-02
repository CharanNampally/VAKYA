import { afterEach, expect, it, vi } from 'vitest';
import { canRun, Capabilities, connectCompanion, runLocalTutor } from '../../src/localTutor/api';
import { localCopy } from '../../src/localTutor/copy';

afterEach(() => vi.unstubAllGlobals());
const capability: Capabilities = {
  protocol: 1, translation: { 'en-indic': true, 'indic-en': false, 'indic-indic': false },
  analysis: false, conversation: false, speech: false, sources: ['en', 'hi', 'te', 'sa'],
};

it('gates operations by the exact required provider', () => {
  expect(canRun(capability, 'teach', 'en')).toBe(true);
  expect(canRun(capability, 'teach', 'te')).toBe(false);
  expect(canRun(capability, 'teach', 'sa')).toBe(true);
  expect(canRun(capability, 'analyze', 'sa')).toBe(false);
  expect(canRun(capability, 'converse', 'en')).toBe(false);
});

it('uses only the fixed loopback endpoint and a bearer header', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json(capability));
  vi.stubGlobal('fetch', fetch);
  await expect(connectCompanion('test-token', new AbortController().signal)).resolves.toEqual(capability);
  expect(fetch).toHaveBeenCalledWith('http://127.0.0.1:8765/v1/capabilities', expect.objectContaining({
    headers: { Authorization: 'Bearer test-token' },
  }));
});

it('rejects malformed successful responses', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ sanskrit: 17 })));
  await expect(runLocalTutor('teach', 'test-token', new AbortController().signal, {})).rejects.toMatchObject({ code: 'invalid_output' });
});

it('preserves explicit busy errors without another provider call', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ error: { code: 'busy' } }, { status: 429 }));
  vi.stubGlobal('fetch', fetch);
  await expect(runLocalTutor('teach', 'test-token', new AbortController().signal, {})).rejects.toMatchObject({ code: 'busy' });
  expect(fetch).toHaveBeenCalledOnce();
});

it('fully localizes the companion interface and error codes', () => {
  for (const copy of Object.values(localCopy)) {
    expect(Object.keys(copy).sort()).toEqual(Object.keys(localCopy.en).sort());
    for (const value of Object.values(copy)) expect(value.trim()).not.toBe('');
  }
});

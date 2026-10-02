import { afterEach, describe, expect, it, vi } from 'vitest';
import { languageFromUrl, parseLanguage, urlWithLanguage } from '../../src/language';
import { speechCopy } from '../../src/speech/copy';

afterEach(() => vi.restoreAllMocks());

describe('support languages and share links', () => {
  it.each([
    ['en', 'en'], ['hi', 'hi'], ['te', 'te'], ['te-IN', 'te'], ['EN-us', 'en'],
    [' HI ', 'hi'], [null, null], ['fr', null], ['constructor', null], [17, null],
  ])('parses %s as %s', (value, expected) => {
    expect(parseLanguage(value)).toBe(expected);
  });

  it('reports unsupported URL languages instead of accepting arbitrary keys', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(languageFromUrl(new URL('https://example.com/?lang=fr'))).toBeNull();
    expect(warning).toHaveBeenCalledOnce();
  });

  it('preserves routes, other query parameters and fragments', () => {
    const original = new URL('https://example.com/?mode=transcribe&lang=en&ref=friend#sample');
    const next = urlWithLanguage(original, 'te');
    expect(next.href).toBe('https://example.com/?mode=transcribe&lang=te&ref=friend#sample');
    expect(original.searchParams.get('lang')).toBe('en');
    expect(languageFromUrl(next)).toBe('te');
  });

  it('has complete nonempty speech translations', () => {
    for (const copy of Object.values(speechCopy)) {
      expect(Object.keys(copy).sort()).toEqual(Object.keys(speechCopy.en).sort());
      for (const value of Object.values(copy)) expect(value.trim().length).toBeGreaterThan(0);
    }
  });
});

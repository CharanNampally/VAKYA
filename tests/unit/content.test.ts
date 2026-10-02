import { describe, expect, it } from 'vitest';

import { languageNames, lessons, ui } from '../../src/content';

describe('localized Sanskrit curriculum', () => {
  it('keeps every lesson complete in each support language', () => {
    const languages = Object.keys(languageNames);

    for (const lesson of lessons) {
      expect(Object.keys(lesson.title)).toEqual(languages);
      expect(Object.keys(lesson.subtitle)).toEqual(languages);
      expect(lesson.phrases.length).toBeGreaterThan(0);
      for (const phrase of lesson.phrases) {
        expect(phrase.devanagari).not.toBe('');
        expect(phrase.iast).not.toBe('');
        expect(Object.keys(phrase.meaning)).toEqual(languages);
      }
    }
  });

  it('localizes every interface string', () => {
    for (const localizedText of Object.values(ui)) {
      expect(localizedText.en).not.toBe('');
      expect(localizedText.hi).not.toBe('');
      expect(localizedText.te).not.toBe('');
    }
  });
});

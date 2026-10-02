import { languageNames } from './content';
import { SupportLanguage } from './types';

export function parseLanguage(value: unknown): SupportLanguage | null {
  const primary = typeof value === 'string' ? value.trim().toLowerCase().split('-')[0] : undefined;
  return primary && Object.prototype.hasOwnProperty.call(languageNames, primary)
    ? primary as SupportLanguage
    : null;
}

export function languageFromUrl(url: URL): SupportLanguage | null {
  const value = url.searchParams.get('lang');
  const language = parseLanguage(value);
  if (value !== null && !language) console.warn('Unsupported URL language; using saved language or English.');
  return language;
}

export function urlWithLanguage(url: URL, language: SupportLanguage): URL {
  const next = new URL(url);
  next.searchParams.set('lang', language);
  return next;
}

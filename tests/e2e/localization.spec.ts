import { expect, test } from '@playwright/test';
import { t } from '../../src/content';
import { speechCopy } from '../../src/speech/copy';

test('defaults to English and switches instantly without requests or onboarding completion', async ({ page }) => {
  await page.goto('/?mode=transcribe&ref=friend#sample');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByText(speechCopy.en.title, { exact: true })).toBeVisible();
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  for (const language of ['te', 'hi', 'en'] as const) {
    const started = Date.now();
    await page.getByTestId(`select-language-${language}`).click();
    await expect(page.getByTestId('load-asr')).toHaveText(speechCopy[language].download, { timeout: 500 });
    expect(Date.now() - started).toBeLessThan(1000);
    await expect(page.locator('html')).toHaveAttribute('lang', language);
    await expect(page.getByTestId(`select-language-${language}`)).toHaveAttribute('aria-checked', 'true');
    const url = new URL(page.url());
    expect(url.searchParams.get('lang')).toBe(language);
    expect(url.searchParams.get('mode')).toBe('transcribe');
    expect(url.searchParams.get('ref')).toBe('friend');
    expect(url.hash).toBe('#sample');
  }
  expect(requests).toEqual([]);
  await page.getByTestId('select-language-te').click();
  await page.reload();
  await expect(page.getByTestId('load-asr')).toHaveText(speechCopy.te.download);
  await page.goto('/');
  await expect(page.getByText(t('welcomeTitle', 'te'))).toBeVisible();
  await expect(page.getByTestId('onboarding-continue')).toBeVisible();
});

test('shared language overrides saved settings and works on a fresh page', async ({ page, context }) => {
  await page.goto('/?lang=hi');
  await expect(page.getByText(t('welcomeTitle', 'hi'))).toBeVisible();
  await page.goto('/?mode=transcribe&lang=te-IN');
  await expect(page.getByTestId('load-asr')).toHaveText(speechCopy.te.download);
  const sharedLink = page.url();
  expect(new URL(sharedLink).searchParams.get('lang')).toBe('te');
  const recipient = await context.browser()!.newContext();
  try {
    const freshPage = await recipient.newPage();
    await freshPage.goto(sharedLink);
    await expect(freshPage.getByTestId('load-asr')).toHaveText(speechCopy.te.download);
  } finally {
    await recipient.close();
  }
  await page.goto('/?mode=transcribe&lang=unsupported');
  await expect(page.getByTestId('load-asr')).toHaveText(speechCopy.te.download);
});

test('all learning screens switch without losing lesson input or progress', async ({ page }) => {
  await page.goto('/?lang=te');
  await expect(page.getByText(t('welcomeTitle', 'te'))).toBeVisible();
  await page.getByTestId('onboarding-continue').click();
  await expect(page.getByText(t('languageTitle', 'te'))).toBeVisible();
  await page.getByTestId('language-hi').click();
  await expect(page.getByTestId('select-language-hi')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('onboarding-continue').click();
  await expect(page.getByText(t('scriptTitle', 'hi'))).toBeVisible();
  await page.getByTestId('select-language-te').click();
  await expect(page.getByText(t('scriptTitle', 'te'))).toBeVisible();
  await page.getByTestId('onboarding-continue').click();
  await expect(page.getByText(t('levelTitle', 'te'))).toBeVisible();
  await page.getByTestId('onboarding-continue').click();
  await expect(page.getByText(t('speakToday', 'te'))).toBeVisible();
  await page.getByTestId('lesson-greetings').click();
  await page.getByTestId('tutor-input').fill('नमस्ते');
  for (const language of ['hi', 'en', 'te'] as const) {
    await page.getByTestId(`select-language-${language}`).click();
    await expect(page.getByText(t('tutorStatus', language))).toBeVisible();
    await expect(page.getByTestId('finish-lesson')).toHaveText(t('finish', language));
    await expect(page.getByTestId('tutor-input')).toHaveValue('नमस्ते');
    await expect(page.getByTestId('tutor-input')).toHaveAttribute('placeholder', t('typeReply', language));
  }
  await expect(page.getByText('ఆత్మవిశ్వాసంతో పలకరించండి')).toBeVisible();
  await page.getByTestId('finish-lesson').click();
  await page.getByTestId('nav-progress').click();
  await expect(page.getByText(t('progressTitle', 'te'))).toBeVisible();
  await expect(page.getByText('25%')).toBeVisible();
  await page.getByTestId('select-language-hi').click();
  await expect(page.getByText(t('lessonsFinished', 'hi'))).toBeVisible();
  await expect(page.getByText('25%')).toBeVisible();
  await page.getByTestId('nav-practice').click();
  await expect(page.getByText(t('chooseConversation', 'hi'))).toBeVisible();
  await expect(page.getByTestId('load-asr')).toHaveText(speechCopy.hi.download);
  await page.getByTestId('nav-settings').click();
  await expect(page.getByText(t('settingsTitle', 'hi'))).toBeVisible();
  await page.getByTestId('select-language-te').click();
  await expect(page.getByText(t('reset', 'te'))).toBeVisible();
  await page.reload();
  await expect(page.getByText(t('speakToday', 'te'))).toBeVisible();
  await page.getByTestId('nav-progress').click();
  await expect(page.getByText('25%')).toBeVisible();
});

test('speech and tutor errors relocalize and future tutor requests use the selected language', async ({ page }) => {
  await page.route('**/asr/worker.js', (route) => route.abort());
  await page.goto('/?mode=transcribe');
  await page.getByTestId('load-asr').click();
  await expect(page.getByTestId('asr-error')).toHaveText(speechCopy.en.modelError);
  await page.getByTestId('select-language-te').click();
  await expect(page.getByTestId('asr-error')).toHaveText(speechCopy.te.modelError);
  await expect(page.getByTestId('load-asr')).toHaveText(speechCopy.te.retry);
  await page.goto('/?lang=te');
  for (let step = 0; step < 4; step++) await page.getByTestId('onboarding-continue').click();
  await page.getByTestId('lesson-greetings').click();
  const languages: string[] = [];
  await page.route('**/api/tutor', (route) => {
    languages.push(route.request().postDataJSON().supportLanguage);
    return route.fulfill({ json: { sanskrit: 'नमस्ते', transliteration: 'namaste', support: 'నమస్కారం' } });
  });
  await page.getByTestId('tutor-input').fill('नमस्ते');
  await page.getByTestId('send-message').click();
  await expect(page.getByText('నమస్కారం', { exact: true })).toBeVisible();
  expect(languages).toEqual(['te']);
  await page.getByTestId('select-language-hi').click();
  await expect(page.getByText(t('previousReply', 'hi'))).toBeVisible();
  await page.getByTestId('tutor-input').fill('नमस्ते');
  await page.getByTestId('send-message').click();
  await expect.poll(() => languages).toEqual(['te', 'hi']);
  await expect(page.getByTestId('tutor-input')).toBeEditable();
  await page.unroute('**/api/tutor');
  await page.route('**/api/tutor', (route) => route.fulfill({ contentType: 'text/html', body: '<html></html>' }));
  await page.getByTestId('tutor-input').fill('नमस्ते');
  await page.getByTestId('send-message').click();
  await expect(page.getByRole('alert')).toHaveText(t('tutorConfig', 'hi'));
  await page.getByTestId('select-language-te').click();
  await expect(page.getByRole('alert')).toHaveText(t('tutorConfig', 'te'));
});

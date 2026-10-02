import { expect, test } from '@playwright/test';
import { hostedCopy } from '../../src/localTutor/copy';

test.skip(!process.env.HOSTED_TUTOR_TEST, 'Requires a build configured with EXPO_PUBLIC_TUTOR_API_URL.');

const capabilities = {
  protocol: 1, translation: { 'en-indic': true, 'indic-en': true, 'indic-indic': true },
  analysis: true, conversation: true, speech: true, sources: ['en', 'hi', 'te', 'sa'],
};

test('hosted tutor automatically connects, translates and preserves language links without pairing', async ({ page }) => {
  const sent: string[] = [];
  await page.route('**/v1/**', async (route) => {
    const request = route.request();
    expect(request.headers().authorization).toBeUndefined();
    sent.push(request.url());
    if (request.url().endsWith('capabilities')) return route.fulfill({ json: capabilities });
    expect(request.postDataJSON()).toEqual({ text: 'I read.', sourceLanguage: 'en' });
    return route.fulfill({ json: {
      sanskrit: 'अहं पठामि।', transliteration: 'ahaṃ paṭhāmi.', provider: 'fixture',
      warnings: ['machine_translation'],
    } });
  });
  await page.goto('/?mode=tutor&lang=en');
  await expect(page.getByTestId('companion-connected')).toHaveText(hostedCopy.en.connected);
  await expect(page.getByTestId('companion-token')).toHaveCount(0);
  await page.getByTestId('local-tutor-input').fill('I read.');
  await page.getByTestId('run-local').click();
  await expect(page.getByTestId('local-result')).toContainText('अहं पठामि।');
  await expect(page.getByTestId('listen-tutor')).toBeVisible();
  await page.getByTestId('select-language-te').click();
  await expect(page.getByText(hostedCopy.te.title, { exact: true }).first()).toBeVisible();
  await expect(page.getByTestId('local-tutor-input')).toHaveValue('I read.');
  expect(new URL(page.url()).searchParams.get('lang')).toBe('te');
  expect(sent).toHaveLength(2);
});

test('hosted quota failure is explicit, localized, and does not fall back', async ({ page }) => {
  let calls = 0;
  await page.route('**/v1/**', (route) => {
    if (route.request().url().endsWith('capabilities')) return route.fulfill({ json: capabilities });
    calls++;
    return route.fulfill({ status: 429, json: { error: { code: 'quota_exceeded' } } });
  });
  await page.goto('/?mode=tutor&lang=en');
  await page.getByTestId('local-tutor-input').fill('Hello');
  await page.getByTestId('run-local').click();
  await expect(page.getByRole('alert')).toHaveText(hostedCopy.en.quota_exceeded);
  await page.getByTestId('select-language-hi').click();
  await expect(page.getByRole('alert')).toHaveText(hostedCopy.hi.quota_exceeded);
  expect(calls).toBe(1);
});

test('hosted connection failure supports retry without showing a local installation prompt', async ({ page }) => {
  let attempts = 0;
  await page.route('**/v1/capabilities', (route) => {
    attempts++;
    if (attempts === 1) return route.abort();
    return route.fulfill({ json: capabilities });
  });
  await page.goto('/?mode=tutor&lang=en');
  await expect(page.getByRole('alert')).toHaveText(hostedCopy.en.unreachable);
  await expect(page.getByTestId('companion-token')).toHaveCount(0);
  await page.getByTestId('connect-companion').click();
  await expect(page.getByTestId('companion-connected')).toBeVisible();
});

test('explicit local mode preserves opt-in pairing', async ({ page }) => {
  await page.goto('/?mode=tutor&lang=en&service=local');
  await expect(page.getByTestId('companion-token')).toBeVisible();
  await expect(page.getByTestId('companion-connected')).toHaveCount(0);
});

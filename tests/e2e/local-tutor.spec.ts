import { expect, test } from '@playwright/test';
import { localCopy } from '../../src/localTutor/copy';
import { readFile } from 'node:fs/promises';

const capabilities = {
  protocol: 1, translation: { 'en-indic': true, 'indic-en': false, 'indic-indic': false },
  analysis: true, conversation: false, speech: false, sources: ['en', 'hi', 'te', 'sa'],
};
const token = 'test-only-pairing-token';
test.use({ trace: 'off' });

test('local tutor route is localized and makes no companion requests before pairing', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes(':8765')) requests.push(request.url());
  });
  await page.goto('/?mode=tutor&lang=te');
  await expect(page.getByText(localCopy.te.title, { exact: true })).toBeVisible();
  expect(requests).toEqual([]);
  await page.getByTestId('companion-token').fill(token);
  await page.getByTestId('select-language-hi').click();
  await expect(page.getByTestId('companion-token')).toHaveValue(token);
  await expect(page.getByText(localCopy.hi.title, { exact: true })).toBeVisible();
  expect(page.url()).not.toContain(token);
  expect(new URL(page.url()).searchParams.get('mode')).toBe('tutor');
});

test('fixture provider pairs, runs Teach and analysis, and gates missing models', async ({ page }) => {
  const requests: string[] = [];
  await page.route('http://127.0.0.1:8765/v1/**', async (route) => {
    const request = route.request();
    requests.push(request.url());
    expect(request.headers().authorization).toBe(`Bearer ${token}`);
    if (request.url().endsWith('capabilities')) return route.fulfill({ json: capabilities });
    if (request.url().endsWith('analyze')) return route.fulfill({ json: {
      provider: 'fixture', warnings: ['candidate_analysis'],
      words: [{ word: 'रामः', candidates: [{ root: 'rAma', tags: ['ekavacanam'] }] }],
    } });
    expect(request.postDataJSON()).toEqual({ text: 'I read.', sourceLanguage: 'en' });
    return route.fulfill({ json: {
      sanskrit: 'अहं पठामि।', transliteration: 'ahaṃ paṭhāmi.', provider: 'fixture',
      warnings: ['machine_translation'],
    } });
  });
  await page.goto('/?mode=tutor&lang=en');
  await page.getByTestId('companion-token').fill(token);
  await page.getByTestId('connect-companion').click();
  await expect(page.getByTestId('companion-connected')).toBeVisible();
  await page.getByTestId('local-tutor-input').fill('I read.');
  await page.getByTestId('run-local').click();
  await expect(page.getByText('अहं पठामि।', { exact: true })).toBeVisible();
  await page.getByTestId('select-language-te').click();
  await expect(page.getByText(localCopy.te.machine_translation)).toBeVisible();
  await expect(page.getByTestId('local-tutor-input')).toHaveValue('I read.');
  await page.getByTestId('local-source-te').click();
  await expect(page.getByTestId('run-local')).toBeDisabled();
  await page.getByTestId('local-mode-converse').click();
  await expect(page.getByTestId('run-local')).toBeDisabled();
  await page.getByTestId('local-mode-analyze').click();
  await page.getByTestId('local-tutor-input').fill('रामः');
  await page.getByTestId('run-local').click();
  await expect(page.getByText('rAma: ekavacanam')).toBeVisible();
  expect(requests).toHaveLength(3);
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(token);
});

test('pairing failures remain explicit and relocalize instantly', async ({ page }) => {
  await page.route('http://127.0.0.1:8765/v1/**', (route) => route.fulfill({
    status: 401, json: { error: { code: 'unauthorized', message: 'Pair first.' } },
  }));
  await page.goto('/?mode=tutor');
  await page.getByTestId('companion-token').fill(token);
  await page.getByTestId('connect-companion').click();
  await expect(page.getByRole('alert')).toHaveText(localCopy.en.unauthorized);
  await page.getByTestId('select-language-te').click();
  await expect(page.getByRole('alert')).toHaveText(localCopy.te.unauthorized);
});

test('real loopback companion pairs and produces actual IAST without a model', async ({ page }, testInfo) => {
  test.skip(process.env.COMPANION_LIVE_TEST !== '1' || testInfo.project.name !== 'desktop-chromium',
    'Requires a running local companion; no fixture provider is used.');
  const localToken = (await readFile('companion/.state/pairing-token', 'utf8')).trim();
  await page.goto('/?mode=tutor&lang=en');
  await page.getByTestId('companion-token').fill(localToken);
  await page.getByTestId('connect-companion').click();
  await expect(page.getByTestId('companion-connected')).toBeVisible();
  await page.getByTestId('local-source-sa').click();
  await page.getByTestId('local-tutor-input').fill('नमस्ते');
  await page.getByTestId('run-local').click();
  await expect(page.getByTestId('local-result').getByText('namaste', { exact: true })).toBeVisible();
  await expect(page.getByText(localCopy.en.transliteration_only)).toBeVisible();
  await page.getByTestId('local-mode-analyze').click();
  await page.getByTestId('local-tutor-input').fill('रामः फलम् खादति।');
  await page.getByTestId('run-local').click();
  await expect(page.getByTestId('local-result').last()).toContainText('rAma', { timeout: 20000 });
});

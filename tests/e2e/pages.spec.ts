import { expect, test } from '@playwright/test';

const site = process.env.PAGES_TEST_URL;
test.skip(!site, 'Set PAGES_TEST_URL to validate an exported or deployed Pages site.');

test('Pages serves the app and preserves the subpath when sharing a language', async ({ page }) => {
  const url = new URL(site!);
  url.searchParams.set('mode', 'transcribe');
  url.searchParams.set('lang', 'en');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url.href);
  await expect(page.getByTestId('load-asr')).toHaveText('Download speech model');
  await page.getByTestId('select-language-te').click();
  await expect(page.getByTestId('load-asr')).toHaveText('వాణి మోడల్ దిగుమతి');
  expect(new URL(page.url()).pathname).toBe(url.pathname);
  expect(new URL(page.url()).searchParams.get('lang')).toBe('te');
  await page.reload();
  await expect(page.getByTestId('load-asr')).toHaveText('వాణి మోడల్ దిగుమతి');
  expect(errors).toEqual([]);
});

test('Pages loads the real worker and sample from its subpath and transcribes locally', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Run real model inference once.');
  test.setTimeout(360000);
  const url = new URL(site!);
  url.searchParams.set('mode', 'transcribe');
  const assets: string[] = [];
  const uploads: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST') uploads.push(request.url());
    const requested = new URL(request.url());
    if (requested.origin === url.origin && requested.protocol === url.protocol) assets.push(requested.pathname);
  });
  await page.goto(url.href);
  await page.getByTestId('load-asr').click();
  await expect(page.getByTestId('asr-ready')).toBeVisible({ timeout: 300000 });
  await page.getByTestId('sample-asr').click();
  await expect(page.getByTestId('asr-transcript')).toHaveValue('परस्परानुकथनं', { timeout: 60000 });
  expect(assets).toContain(`${url.pathname}asr/worker.js`);
  expect(assets).toContain(`${url.pathname}audio/sushrota-sample.wav`);
  expect(assets.filter((asset) => !asset.startsWith(url.pathname))).toEqual([]);
  expect(uploads).toEqual([]);
});

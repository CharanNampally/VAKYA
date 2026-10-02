import { expect, test } from '@playwright/test';
import path from 'node:path';

test('local transcription is accessible without onboarding and never downloads without consent', async ({ page }) => {
  const modelRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('huggingface.co')) modelRequests.push(request.url());
  });
  await page.goto('/?mode=transcribe');
  await expect(page.getByText('Sanskrit transcription', { exact: true })).toBeVisible();
  await expect(page.getByTestId('load-asr')).toBeVisible();
  await expect(page.getByTestId('record-asr')).toHaveCount(0);
  expect(modelRequests).toEqual([]);
});

test('model failure is explicit and can be retried', async ({ page }) => {
  await page.route('**/asr/worker.js', (route) => route.abort());
  await page.goto('/?mode=transcribe');
  await page.getByTestId('load-asr').click();
  await expect(page.getByTestId('asr-error')).toContainText('Could not load');
  await expect(page.getByTestId('load-asr')).toContainText('Retry');
});

test('real model transcribes public audio, handles microphone capture, and keeps audio local', async ({ page, context, browserName }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium' || browserName !== 'chromium', 'Download the real model only once, on desktop.');
  test.setTimeout(360000);
  const uploads: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST') uploads.push(request.url());
  });
  await context.grantPermissions(['microphone']);
  await page.goto('/?mode=transcribe');
  await page.getByTestId('load-asr').click();
  await expect(page.getByTestId('asr-ready')).toBeVisible({ timeout: 300000 });
  await page.getByTestId('sample-asr').click();
  await expect(page.getByTestId('asr-transcript')).toHaveValue(/[\u0900-\u097f]/, { timeout: 60000 });
  const transcript = await page.getByTestId('asr-transcript').inputValue();
  console.log('Real Su-shrota sample transcript:', transcript);
  expect(transcript.replace(/\s/g, '')).toBe('परस्परानुकथनं');
  await expect(page.getByTestId('asr-timing')).toContainText('ms');

  await page.getByTestId('select-language-te').click();
  await expect(page.getByTestId('asr-ready')).toContainText('మోడల్ సిద్ధం');
  await expect(page.getByTestId('asr-transcript')).toHaveValue(transcript);
  await page.getByTestId('select-language-en').click();
  await expect(page.getByTestId('asr-ready')).toContainText('Model ready');

  await page.locator('input[type=file]').setInputFiles(path.resolve('public/audio/sushrota-sample.wav'));
  await expect(page.getByTestId('asr-transcript')).toHaveValue(/[\u0900-\u097f]/, { timeout: 60000 });

  await page.getByTestId('record-asr').click();
  await expect(page.getByTestId('stop-asr')).toBeVisible();
  await page.waitForTimeout(4200);
  await page.getByTestId('stop-asr').click();
  await expect(page.getByTestId('asr-transcript')).toHaveValue(/[\u0900-\u097f]/, { timeout: 60000 });
  expect(uploads).toEqual([]);

  await page.reload();
  await page.route('https://huggingface.co/**', (route) => route.abort());
  await page.getByTestId('load-asr').click();
  await expect(page.getByTestId('asr-ready')).toBeVisible({ timeout: 60000 });
  await page.getByTestId('sample-asr').click();
  await expect(page.getByTestId('asr-transcript')).toHaveValue(/[\u0900-\u097f]/, { timeout: 60000 });
});

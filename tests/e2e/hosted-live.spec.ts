import { expect, test } from '@playwright/test';

const site = process.env.HOSTED_LIVE_URL;

test('public tutor translates, converses, and plays actual hosted Sanskrit audio', async ({ page }, testInfo) => {
  test.skip(!site || testInfo.project.name !== 'desktop-chromium',
    'Opt in with HOSTED_LIVE_URL; this consumes real inference quota.');
  test.setTimeout(600000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const originalPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      if (this.src.startsWith('blob:')) {
        void fetch(this.src).then((response) => response.arrayBuffer()).then((buffer) => {
          document.documentElement.dataset.vakyaWavHeader = new TextDecoder().decode(buffer.slice(0, 4));
          document.documentElement.dataset.vakyaWavBytes = String(buffer.byteLength);
        });
      }
      this.addEventListener('timeupdate', () => {
        document.documentElement.dataset.vakyaAudioTime = String(this.currentTime);
      });
      return originalPlay.call(this);
    };
  });

  const url = new URL(site!);
  url.searchParams.set('mode', 'tutor');
  url.searchParams.set('lang', 'en');
  await page.goto(url.href);
  await expect(page.getByTestId('companion-connected')).toBeVisible({ timeout: 240000 });
  await expect(page.getByTestId('companion-token')).toHaveCount(0);
  await page.getByTestId('local-tutor-input').fill('I read a book.');
  const translated = page.waitForResponse((response) => response.url().endsWith('/v1/teach'), { timeout: 240000 });
  await page.getByTestId('run-local').click();
  const translation = await translated;
  expect(translation.status()).toBe(200);
  const result = await translation.json();
  expect(result.provider).toBe('google/madlad400-3b-mt');
  expect(result.sanskrit).toMatch(/[\u0900-\u097f]/u);
  expect(result.transliteration.length).toBeGreaterThan(0);
  await expect(page.getByTestId('local-result')).toContainText(result.sanskrit);

  const speech = page.waitForResponse((response) => response.url().endsWith('/v1/speak') && response.request().method() === 'POST', { timeout: 180000 });
  await page.getByTestId('listen-tutor').click();
  const wav = await speech;
  expect(wav.status()).toBe(200);
  expect(wav.headers()['content-type']).toContain('audio/wav');
  expect(await wav.finished()).toBeNull();
  await testInfo.attach('speech-response', {
    body: JSON.stringify({ method: wav.request().method(), headers: wav.headers() }),
    contentType: 'application/json',
  });
  await page.waitForFunction(() => Number(document.documentElement.dataset.vakyaAudioTime ?? 0) > 0.15, undefined, { timeout: 30000 });
  expect(await page.locator('html').getAttribute('data-vakya-wav-header')).toBe('RIFF');
  expect(Number(await page.locator('html').getAttribute('data-vakya-wav-bytes'))).toBeGreaterThan(1000);

  await page.getByTestId('select-language-te').click();
  await page.getByTestId('local-mode-converse').click();
  await page.getByTestId('local-tutor-input').fill('Hello. I would like to practice.');
  const conversed = page.waitForResponse((response) => response.url().endsWith('/v1/converse'), { timeout: 240000 });
  await page.getByTestId('run-local').click();
  const conversation = await conversed;
  expect(conversation.status()).toBe(200);
  const reply = await conversation.json();
  expect(reply.sanskrit).toMatch(/[\u0900-\u097f]/u);
  expect(reply.support).toMatch(/[\u0c00-\u0c7f]/u);
  expect(reply.provider).toBe('Qwen/Qwen3-4B+madlad');
  expect(reply.history).toHaveLength(2);
  await expect(page.getByTestId('local-result').last()).toContainText(reply.support);
  expect(errors).toEqual([]);
});

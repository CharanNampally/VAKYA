import { expect, test } from '@playwright/test';

test('onboards a learner and completes the first lesson', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('Learn Sanskrit by speaking it')).toBeVisible();
  await page.getByTestId('onboarding-continue').click();

  await page.getByTestId('language-en').click();
  await page.getByTestId('onboarding-continue').click();
  await page.getByText('संस्कृतम् · saṃskṛtam').click();
  await page.getByTestId('onboarding-continue').click();
  await page.getByText('New to Sanskrit').click();
  await page.getByTestId('onboarding-continue').click();

  await expect(page.getByText('Let’s speak a little Sanskrit today.')).toBeVisible();
  await page.getByTestId('lesson-greetings').click();
  await expect(page.getByText('YOUR SANSKRIT TUTOR · ONLINE')).toBeVisible();
  await expect(page.getByText('नमस्ते! अद्य वयं सम्भाषणस्य अभ्यासं कुर्मः।')).toBeVisible();
  await page.getByTestId('finish-lesson').click();

  await page.getByTestId('nav-progress').click();
  await expect(page.getByText('25%')).toBeVisible();
  await expect(page.getByText('नमस्ते')).toBeVisible();
});

test('opens free practice from bottom navigation', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('onboarding-continue').click();
  await page.getByTestId('onboarding-continue').click();
  await page.getByTestId('onboarding-continue').click();
  await page.getByTestId('onboarding-continue').click();

  await page.getByTestId('nav-practice').click();
  await expect(page.getByText('Choose a conversation.')).toBeVisible();
  await expect(page.getByText('FREE PRACTICE · मुक्ताभ्यासः')).toBeVisible();
});

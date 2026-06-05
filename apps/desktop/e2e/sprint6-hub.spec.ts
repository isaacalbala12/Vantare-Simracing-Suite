import { test, expect } from '@playwright/test';

test.describe('Sprint 6 Hub flows', () => {
  test('themes and account routes are registered', async ({ page }) => {
    await page.goto('/themes');
    await expect(page.getByTestId('themes-page')).toBeVisible();

    await page.goto('/account');
    await expect(page.getByTestId('account-page')).toBeVisible();
    await expect(page.getByTestId('account-mode-login')).toBeVisible();
  });
});

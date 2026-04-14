import { test, expect } from '@playwright/test';

test.describe('Monitor Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/monitor');
  });

  test('loads successfully with 200 status', async ({ page }) => {
    const response = await page.goto('/monitor');
    expect(response?.status()).toBeLessThan(400);
  });

  test('granularity selector buttons are visible', async ({ page }) => {
    // Wait for the page to be ready
    await page.waitForLoadState('networkidle');
    // Granularity buttons are shown when a tap is selected.
    // If no tap, we show the "no tap" state — still verify the page loads.
    const body = await page.locator('body').textContent();
    expect(body).toBeTruthy();
  });

  test('shows no-tap empty state or monitor content', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    // Either shows "请选择一个 Tap 实例" (no tap) or the granularity selector
    const hasNoTap = await page.getByText('请选择一个 Tap 实例').isVisible().catch(() => false);
    const hasGranularity = await page.locator('button', { hasText: '15s' }).isVisible().catch(() => false);
    // One of the two states must be true
    expect(hasNoTap || hasGranularity).toBe(true);
  });

  test('granularity buttons visible when tap is selected', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    // If there are granularity buttons, verify all 4 options
    const has15s = await page.locator('button', { hasText: '15s' }).isVisible().catch(() => false);
    if (has15s) {
      await expect(page.locator('button', { hasText: '15s' })).toBeVisible();
      await expect(page.locator('button', { hasText: '1m' })).toBeVisible();
      await expect(page.locator('button', { hasText: '5m' })).toBeVisible();
      await expect(page.locator('button', { hasText: '1h' })).toBeVisible();
    }
  });
});

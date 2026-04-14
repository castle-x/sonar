import { test, expect } from '@playwright/test';

test.describe('Settings Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
  });

  test('page loads successfully', async ({ page }) => {
    const response = await page.goto('/settings');
    expect(response?.status()).toBeLessThan(400);
  });

  test('page title 设置 is visible in main content', async ({ page }) => {
    // Two h1s exist (header title + page content title) — target the page content one
    await expect(page.locator('h1').filter({ hasText: '设置' }).nth(1)).toBeVisible();
  });

  test('server URL input is present with placeholder', async ({ page }) => {
    const input = page.locator('input[placeholder="http://localhost:8283"]');
    await expect(input).toBeVisible();
  });

  test('save button is present', async ({ page }) => {
    await expect(page.getByRole('button', { name: '保存' })).toBeVisible();
  });

  test('server address section heading is visible', async ({ page }) => {
    await expect(page.getByText('服务器地址')).toBeVisible();
  });

  test('connected taps section is visible', async ({ page }) => {
    await expect(page.getByText('已连接的 Tap 实例')).toBeVisible();
  });

  test('can type in server URL input and save', async ({ page }) => {
    const input = page.locator('input[placeholder="http://localhost:8283"]');
    await input.fill('http://localhost:9999');
    await page.getByRole('button', { name: '保存' }).click();
    // Toast message should appear
    await expect(page.getByText('设置已保存')).toBeVisible({ timeout: 5000 });
  });
});

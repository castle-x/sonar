import { test, expect } from '@playwright/test';

test.describe('Snapshots Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/snapshots');
    await page.waitForLoadState('networkidle');
  });

  test('page loads successfully', async ({ page }) => {
    const response = await page.goto('/snapshots');
    expect(response?.status()).toBeLessThan(400);
  });

  test('page title 快照 is visible in main content', async ({ page }) => {
    // Two h1s exist (header title + page content title) — target the page content one
    await expect(page.locator('h1').filter({ hasText: '快照' }).nth(1)).toBeVisible();
  });

  test('create snapshot button is visible', async ({ page }) => {
    // Either in header or empty state
    const createBtn = page.getByText('+ 创建快照');
    await expect(createBtn.first()).toBeVisible();
  });

  test('shows list or empty state', async ({ page }) => {
    const hasEmptyState = await page.getByText('暂无快照').isVisible().catch(() => false);
    const hasCards = await page.locator('.rounded-xl.border.bg-card').count() > 0;
    expect(hasEmptyState || hasCards).toBe(true);
  });

  test('clicking 创建快照 opens dialog', async ({ page }) => {
    await page.getByText('+ 创建快照').first().click();
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    await expect(page.locator('[role="dialog"]').getByText('创建快照')).toBeVisible();
  });
});

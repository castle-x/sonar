import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test('should redirect / to /monitor', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/monitor/);
  });

  test('sidebar shows 监控, 快照, 采集器, 设置 nav items', async ({ page }) => {
    await page.goto('/monitor');
    // Use role=link to avoid strict-mode multi-element matches
    await expect(page.getByRole('link', { name: '监控' })).toBeVisible();
    await expect(page.getByRole('link', { name: '快照' })).toBeVisible();
    await expect(page.getByRole('link', { name: '采集器' })).toBeVisible();
    await expect(page.getByRole('link', { name: '设置' })).toBeVisible();
  });

  test('clicking 快照 navigates to /snapshots', async ({ page }) => {
    await page.goto('/monitor');
    await page.getByRole('link', { name: '快照' }).click();
    await expect(page).toHaveURL(/\/snapshots/);
  });

  test('clicking 采集器 navigates to /taps', async ({ page }) => {
    await page.goto('/monitor');
    await page.getByRole('link', { name: '采集器' }).click();
    await expect(page).toHaveURL(/\/taps/);
  });

  test('clicking 设置 navigates to /settings', async ({ page }) => {
    await page.goto('/monitor');
    await page.getByRole('link', { name: '设置' }).click();
    await expect(page).toHaveURL(/\/settings/);
  });

  test('unknown route redirects to /monitor', async ({ page }) => {
    await page.goto('/nonexistent');
    await expect(page).toHaveURL(/\/monitor/);
  });
});

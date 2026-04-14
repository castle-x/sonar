import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:5374',
    headless: true,
    locale: 'zh-CN',
  },
  webServer: {
    command: 'pnpm dev --port 5374',
    url: 'http://localhost:5374',
    reuseExistingServer: true,
    timeout: 60000,
  },
});

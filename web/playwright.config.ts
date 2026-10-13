import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5173', headless: true },
  webServer: { command: 'npm run dev -- --port 5173 --host 127.0.0.1', url: 'http://127.0.0.1:5173', reuseExistingServer: true },
});

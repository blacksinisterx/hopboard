import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  workers: 1,
  reporter: 'list',
  // BASE_URL=https://hopboard.pages.dev runs the same suite against production (CSP + origin allow-list included)
  use: { baseURL: process.env.BASE_URL ?? 'http://127.0.0.1:5173', headless: true },
  webServer: process.env.BASE_URL ? undefined : { command: 'npm run dev -- --port 5173 --host 127.0.0.1', url: 'http://127.0.0.1:5173', reuseExistingServer: true },
});

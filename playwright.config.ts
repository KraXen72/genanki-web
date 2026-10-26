import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3000';

export default defineConfig({
  testDir: './tests/browser',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  webServer: process.env.E2E_PRODUCTION
    ? {
        command: 'node_modules/.bin/vite preview --host 127.0.0.1 --port 4173',
        url: baseURL,
        env: { VITE_BASE: new URL(baseURL).pathname },
        reuseExistingServer: !process.env.CI,
      }
    : undefined,
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
});

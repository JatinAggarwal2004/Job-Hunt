import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests',
  workers: 1,
  use: { channel: 'chrome', headless: true, viewport: { width: 1440, height: 1000 } },
  reporter: 'list',
  webServer: [
    {
      command: 'npm run start',
      gracefulShutdown: { signal: 'SIGTERM', timeout: 20000 },
      url: 'http://127.0.0.1:3002/api/health',
      reuseExistingServer: true,
      env: { PORT: '3002', JOB_HUNTER_DB: `data/e2e-${process.pid}.sqlite` },
      timeout: 30000,
    },
    {
      command: 'npm run preview -- --port 4173',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: true,
      timeout: 30000,
    },
  ],
})

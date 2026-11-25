// Playwright (plan.md section 4, B11, B19, B25, B47): Chromium only, against the e2e
// server of scripts/e2e-server.mts (PGlite + `next start` in the test sign-in mode) on the
// existing build, so `npm run build` runs first (it is the command before it in the check).
import { defineConfig, devices } from '@playwright/test'

const PORT = 3100

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // The script imports a .ts file of src/; the package has no "type", so Node warns once.
    command: 'node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/e2e-server.mts',
    url: `http://127.0.0.1:${PORT}/test/session`,
    env: { E2E_APP_PORT: String(PORT) },
    reuseExistingServer: false,
    timeout: 120_000,
  },
})

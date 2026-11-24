import { defineConfig, devices } from "@playwright/test";
import { BASE_URL } from "./helpers/env";

/**
 * Pretzuri E2E (Playwright) against DEV only: `npm run test:e2e` (E2E_BASE_URL, see helpers/env.ts).
 * One worker, serial files (01 ..): specs read the shared DEV catalog and count real clicks.
 */
export default defineConfig({
  testDir: ".",
  testMatch: /\d\d-.*\.spec\.ts$/,
  outputDir: "../../test-results/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { outputFolder: "../../playwright-report", open: "never" }]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ignoreHTTPSErrors: false,
    locale: "ro-RO",
  },
  projects: [{ name: "pixel7", use: { ...devices["Pixel 7"] } }],
});

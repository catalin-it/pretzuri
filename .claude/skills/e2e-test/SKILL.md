---
name: e2e-test
description: Write and run Playwright end-to-end tests for Pretzuri flows (search, category filters, product page, /go redirect, compare, login with email code, favorites, price alerts, reviews, admin feed/matching screens). Use when a feature needs browser-level verification.
---
- Specs go in `tests/e2e/NN-name.spec.ts`. Target **DEV on the NAS only** (`E2E_BASE_URL`, default
  `https://dev-pretzuri.it-ist.ro`, guarded by an allowlist). Never prod. Start DEV first: `bash infra/nas/dev-up.sh`.
- Test data: import the sample feeds from `worker/fixtures/` through the test helper (it creates a dedicated
  `e2e-<runId>` merchant + feed source) and delete them in `afterAll`. Never touch other DEV data.
- Users: created through a helper using the admin API with the service key from a local, gitignored
  `.env.test.local` (the user provides it; never commit or print it). Emails `e2e+<runId>@test.local`; the login
  code is read from Mailpit (`http://192.168.0.111:8425`). Delete users in `afterAll`.
- `/go/<offerId>`: assert the 302 `location` and that a click row was counted, without following to the real shop.
- Mobile viewport `devices['Pixel 7']` by default; desktop for compare/admin. Run once with `locale: 'en-US'`.
- Assert by role/label/text from i18n keys, never by CSS classes. No fixed sleeps; rely on auto-waiting `expect`.
- Run: `npx playwright test -c tests/e2e/playwright.config.ts <NN-name>`, traces `retain-on-failure`.

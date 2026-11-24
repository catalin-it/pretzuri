import { expect, test, type APIRequestContext } from "@playwright/test";

// Account flow on DEV: sign in with the email code (read from Mailpit), favorite, price alert, data export,
// account deletion (cleans up the test user).
// Needs: E2E_MAILPIT_URL (default http://192.168.0.111:8425, LAN) and E2E_MAILPIT_PASS (NAS supabase/.env
// MAILPIT_UI_PASS; never commit it). Skipped when the password is not set.
const MAILPIT_URL = process.env.E2E_MAILPIT_URL ?? "http://192.168.0.111:8425";
const MAILPIT_PASS = process.env.E2E_MAILPIT_PASS ?? "";

async function readCode(request: APIRequestContext, email: string): Promise<string> {
  const auth = `Basic ${Buffer.from(`pretzuri:${MAILPIT_PASS}`).toString("base64")}`;
  for (let i = 0; i < 30; i++) {
    const res = await request.get(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}&limit=1`, {
      headers: { Authorization: auth },
    });
    if (res.ok()) {
      const body = (await res.json()) as { messages?: { Snippet?: string }[] };
      const m = body.messages?.[0]?.Snippet?.match(/\b(\d{6})\b/);
      if (m) return m[1];
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("no sign-in code in Mailpit");
}

test.skip(!MAILPIT_PASS, "E2E_MAILPIT_PASS not set");

test("sign in with email code, favorite, price alert, export, delete account", async ({ page, request }) => {
  const email = `e2e-${Date.now()}@example.test`;

  await page.goto("/ro/autentificare");
  await page.getByLabel("Adresa de email").fill(email);
  await page.getByRole("button", { name: "Trimite codul" }).click();
  await expect(page.getByRole("status")).toContainText(email);
  await page.getByLabel("Codul de 6 cifre").fill(await readCode(request, email));
  await page.getByRole("button", { name: "Intră în cont" }).click();
  await expect(page).toHaveURL(/\/ro\/cont$/);
  await expect(page.getByRole("heading", { level: 1, name: "Contul meu" })).toBeVisible();

  // A product from search.
  await page.goto("/ro/cautare?q=samsung");
  const first = page.locator("main ul li a[href*='/ro/p/']").first();
  const title = (await first.innerText()).trim();
  await first.click();
  await expect(page).toHaveURL(/\/ro\/p\/[a-z0-9-]+$/);

  // Favorite.
  await page.getByRole("button", { name: /la favorite$/ }).click();
  await expect(page.getByRole("button", { name: /din favorite$/ })).toBeVisible();

  // Price alert by email.
  await page.getByRole("button", { name: "Alertă de preț" }).click();
  await page.getByLabel("Preț țintă (lei)").fill("1");
  await page.getByRole("button", { name: "Salvează alerta" }).click();
  await expect(page.getByRole("button", { name: "Modifică alerta" })).toBeVisible();

  await page.goto("/ro/cont/favorite");
  await expect(page.getByRole("link", { name: title })).toBeVisible();
  await page.goto("/ro/cont/alerte");
  await expect(page.getByRole("link", { name: title })).toBeVisible();
  await page.goto("/ro/cont/istoric");
  await expect(page.getByRole("link", { name: title })).toBeVisible();

  // GDPR export (JSON download with the session cookie).
  const exp = await page.request.get("/api/account/export");
  expect(exp.status()).toBe(200);
  const data = (await exp.json()) as { account: { email: string }; favorites: unknown[]; price_alerts: unknown[] };
  expect(data.account.email).toBe(email);
  expect(data.favorites).toHaveLength(1);
  expect(data.price_alerts).toHaveLength(1);

  // Delete the account (also cleans up).
  await page.goto("/ro/cont");
  await page.getByLabel(/Scrie adresa de email/).fill(email);
  await page.getByRole("button", { name: "Șterge definitiv contul" }).click();
  await expect(page).toHaveURL(/\/ro$/);
  await page.goto("/ro/cont");
  await expect(page).toHaveURL(/\/ro\/autentificare/);
});

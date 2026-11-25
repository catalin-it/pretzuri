import type { Browser, BrowserContext, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { API_URL, BASE_URL, PUBLIC_API_URL } from "./env";
import { createUser, grantAdmin, totp, type TestUser } from "./api";
import { signInWithPassword } from "./ui";

/** Browser context whose Supabase calls (build-time public URL) are proxied to the in-network gateway. */
export async function proxiedContext(browser: Browser, storageState?: Awaited<ReturnType<BrowserContext["storageState"]>>) {
  const context = await browser.newContext({ baseURL: BASE_URL, locale: "ro-RO", storageState });
  await context.route(`${PUBLIC_API_URL}/**`, async (route) => {
    const url = route.request().url().replace(PUBLIC_API_URL, API_URL);
    try {
      await route.fulfill({ response: await route.fetch({ url }) });
    } catch {
      await route.abort();
    }
  });
  return context;
}

/** Waits until the TOTP window changes so a code is never reused (GoTrue may reject a replayed code). */
export async function freshTotp(secret: string): Promise<string> {
  const left = 30_000 - (Date.now() % 30_000);
  if (left < 28_500 && left > 0) await new Promise((r) => setTimeout(r, left + 200));
  return totp(secret);
}

export const ADMIN_PASSWORD = "E2e-admin-pass-123";

export interface AdminSession {
  user: TestUser;
  secret: string;
  state: Awaited<ReturnType<BrowserContext["storageState"]>>;
}

/** Creates a throw-away admin (SQL-style role grant), signs in with the email code and enrolls a TOTP factor. */
export async function createAdminSession(browser: Browser): Promise<AdminSession> {
  const user = await createUser("admin-e2e", ADMIN_PASSWORD);
  await grantAdmin(user.id);
  const context = await proxiedContext(browser);
  const page = await context.newPage();
  await signInWithPassword(page, user.email, ADMIN_PASSWORD);
  await page.goto("/ro/admin");
  await expect(page).toHaveURL(/\/ro\/admin\/mfa$/);
  await page.getByRole("button", { name: "Generează codul QR" }).click();
  const secret = (await page.locator("code").first().innerText()).trim();
  await page.getByLabel("Cod de 6 cifre").fill(await freshTotp(secret));
  await page.getByRole("button", { name: "Verifică" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Panou de administrare" })).toBeVisible();
  const state = await context.storageState();
  await context.close();
  return { user, secret, state };
}

export async function adminPage(browser: Browser, s: AdminSession): Promise<{ context: BrowserContext; page: Page }> {
  const context = await proxiedContext(browser, s.state);
  return { context, page: await context.newPage() };
}

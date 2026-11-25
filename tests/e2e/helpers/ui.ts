import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { clearMail, readCode } from "./api";

/** Sign in through the real UI with the emailed 6-digit code (Mailpit). Works for new and existing users. */
export async function signInWithCode(page: Page, email: string, next?: string) {
  await clearMail(email);
  await page.goto(`/ro/autentificare${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  await page.getByLabel("Adresa de email").fill(email);
  await page.getByRole("button", { name: "Trimite codul" }).click();
  await expect(page.getByRole("status")).toContainText(email);
  await page.getByLabel("Codul de 6 cifre").fill(await readCode(email));
  await page.getByRole("button", { name: "Intră în cont" }).click();
  await expect(page).toHaveURL(next ? new RegExp(next.replace(/[/?]/g, "\\$&")) : /\/ro\/cont$/);
}

export async function signOut(page: Page) {
  await page.goto("/ro/cont");
  await page.getByRole("button", { name: "Ieși din cont" }).click();
  await expect(page).toHaveURL(/\/ro(\/)?$/);
}

/** Sign in with the optional password (user created with a password through the admin API): no email involved. */
export async function signInWithPassword(page: Page, email: string, password: string) {
  await page.goto("/ro/autentificare");
  await page.getByRole("tab", { name: "Parolă" }).click();
  await page.getByLabel("Adresa de email").fill(email);
  await page.getByLabel("Parola", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Intră în cont" }).click();
  await expect(page).toHaveURL(/\/ro\/cont$/);
}

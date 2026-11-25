import { expect, test } from "./helpers/fixtures";
import { a11yBasics, noRawKeys } from "./helpers/fixtures";
import { clearMail, createUser, deleteUser, readCode, rest, type TestUser } from "./helpers/api";
import { signInWithCode, signInWithPassword, signOut } from "./helpers/ui";

// Account: sign-in (code / password), protected pages, profile, favorites, history, price alerts, export,
// deletion. Users are created through the Auth admin API (@example.test) and removed in afterAll.

const users: TestUser[] = [];
const fillerProducts: number[] = [];
async function newUser(prefix: string, password?: string) {
  const u = await createUser(prefix, password);
  users.push(u);
  return u;
}
test.afterAll(async () => {
  for (const u of users) await deleteUser(u.id);
  if (fillerProducts.length) await rest(`products?id=in.(${fillerProducts.join(",")})`, { method: "DELETE" }).catch(() => undefined);
});

let sampleSlug = "";
let sampleId = 0;
test.beforeAll(async () => {
  const [p] = await rest<{ id: number; slug: string }[]>(
    "products?select=id,slug&status=eq.active&offer_count=gte.2&order=id&limit=1",
  );
  sampleSlug = p.slug;
  sampleId = p.id;
});

test("signed-out visitors are sent to sign-in; export is 401; admin is 404", async ({ page, request }) => {
  for (const path of ["/ro/cont", "/ro/cont/favorite", "/ro/cont/alerte", "/ro/cont/istoric"]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/ro\/autentificare\?next=/);
    await expect(page.getByRole("heading", { level: 1, name: "Autentificare" })).toBeVisible();
  }
  const exp = await request.get("/api/account/export");
  expect(exp.status()).toBe(401);
  for (const path of ["/ro/admin", "/ro/admin/feeds/1", "/ro/admin/users", "/en/admin/mfa"]) {
    const r = await request.get(path);
    expect(r.status(), path).toBe(404);
  }
});

test("email-code sign-in: bad input, wrong code, resend, redirect target, sign out", async ({ page }) => {
  const u = await newUser("code");
  await page.goto("/ro/autentificare?next=/ro/cont/favorite");
  await a11yBasics(page);
  await noRawKeys(page);

  // Empty and malformed email never leave the browser (HTML validation), nothing is sent.
  await clearMail(u.email);
  await page.getByRole("button", { name: "Trimite codul" }).click();
  await expect(page.getByLabel("Adresa de email")).toBeFocused();
  await page.getByLabel("Adresa de email").fill("nu-este-email");
  await page.getByRole("button", { name: "Trimite codul" }).click();
  await expect(page.getByRole("status")).toHaveCount(0);

  await page.getByLabel("Adresa de email").fill(u.email);
  await page.getByRole("button", { name: "Trimite codul" }).click();
  await expect(page.getByRole("status")).toContainText(u.email);

  // Code field: digits only, 6 max; wrong code -> error, still on the page.
  const code = page.getByLabel("Codul de 6 cifre");
  await code.fill("12ab34");
  await expect(code).toHaveValue("1234");
  const real = await readCode(u.email);
  await code.fill(real === "123456" ? "654321" : "123456");
  await page.getByRole("button", { name: "Intră în cont" }).click();
  await expect(page.getByText("Codul nu este corect sau a expirat.")).toBeVisible();
  await expect(page).toHaveURL(/autentificare/);
  await code.fill("123");
  await page.getByRole("button", { name: "Intră în cont" }).click(); // too short: native validation blocks
  await expect(page).toHaveURL(/autentificare/);

  // GoTrue allows one code per address per 60 s: an immediate resend shows the rate-limit message and the
  // first code keeps working.
  await page.getByRole("button", { name: "Retrimite codul" }).click();
  await expect(page.getByText("Prea multe încercări.")).toBeVisible();
  await code.fill(real);
  await page.getByRole("button", { name: "Intră în cont" }).click();
  await expect(page).toHaveURL(/\/ro\/cont\/favorite$/); // `next` honoured
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Produse favorite");
  await signOut(page);
  await page.goto("/ro/cont");
  await expect(page).toHaveURL(/autentificare/);
});

test("sign-in never redirects to another site", async ({ page }) => {
  const u = await newUser("redir");
  await clearMail(u.email);
  await page.goto("/ro/autentificare?next=//evil.example/x");
  await page.getByLabel("Adresa de email").fill(u.email);
  await page.getByRole("button", { name: "Trimite codul" }).click();
  await page.getByLabel("Codul de 6 cifre").fill(await readCode(u.email));
  await page.getByRole("button", { name: "Intră în cont" }).click();
  await expect(page).toHaveURL(/\/ro\/cont$/);
});

test("optional password: needs a code, validation, then password sign-in", async ({ page }) => {
  const u = await newUser("pwd", "Initial-pass-123");
  await signInWithPassword(page, u.email, "Initial-pass-123");
  await a11yBasics(page);
  await noRawKeys(page);

  await clearMail(u.email);
  await page.getByRole("button", { name: "Trimite codul de confirmare" }).click();
  await expect(page.getByText("Am trimis un cod de confirmare pe email.")).toBeVisible();
  const code = await readCode(u.email);
  const codeField = page.getByLabel("Codul de confirmare");
  const pwField = page.getByLabel("Parola nouă");

  // Wrong code.
  await codeField.fill(code === "111111" ? "222222" : "111111");
  await pwField.fill("o-parola-lunga-123");
  await page.getByRole("button", { name: "Salvează parola" }).click();
  await expect(page.getByText("Codul nu este corect sau a expirat.")).toBeVisible();
  await expect(page.getByText("Parola a fost salvată.")).toHaveCount(0); // a wrong code must never change the password

  // Too short (9 chars) fails, 10 chars passes.
  // 9 characters: blocked by the browser (minlength) before anything is sent.
  await codeField.fill(code);
  await pwField.fill("123456789");
  await page.getByRole("button", { name: "Salvează parola" }).click();
  await expect(page.getByText("Parola a fost salvată.")).toHaveCount(0);
  expect(await pwField.evaluate((el: HTMLInputElement) => el.validity.tooShort)).toBe(true);
  await pwField.fill("0123456789");
  await page.getByRole("button", { name: "Salvează parola" }).click();
  await expect(page.getByText("Parola a fost salvată.")).toBeVisible();

  await signOut(page);
  await page.goto("/ro/autentificare");
  await page.getByRole("tab", { name: "Parolă" }).click();
  await page.getByLabel("Adresa de email").fill(u.email);
  await page.getByLabel("Parola", { exact: true }).fill("gresita-gresita-1");
  await page.getByRole("button", { name: "Intră în cont" }).click();
  await expect(page.getByText("Email sau parolă greșite.")).toBeVisible();
  await page.getByLabel("Parola", { exact: true }).fill("0123456789");
  await page.getByRole("button", { name: "Intră în cont" }).click();
  await expect(page).toHaveURL(/\/ro\/cont$/);
});

test("profile: display name limits, locale, email alerts switch", async ({ page }) => {
  const u = await newUser("prof");
  await signInWithCode(page, u.email);
  const name = page.getByLabel("Nume afișat (opțional)");
  expect(await name.getAttribute("maxlength")).toBe("40");

  // Boundary: 41 chars cannot even be typed (maxlength), 40 saves, empty clears.
  await name.fill("x".repeat(41));
  await expect(name).toHaveValue("x".repeat(40));
  await page.getByRole("button", { name: "Salvează", exact: true }).click();
  await expect(page.getByText("Am salvat modificările.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Nume afișat (opțional)")).toHaveValue("x".repeat(40));
  await page.getByLabel("Nume afișat (opțional)").fill("   ");
  await page.getByRole("button", { name: "Salvează", exact: true }).click();
  await expect(page.getByText("Am salvat modificările.")).toBeVisible();
  const [prof] = await rest<{ display_name: string | null; locale: string; email_alerts: boolean }[]>(
    `profiles?select=display_name,locale,email_alerts&id=eq.${u.id}`,
  );
  expect(prof.display_name).toBeNull();

  await page.getByLabel("Primesc alertele de preț pe email").uncheck();
  await page.getByLabel("Limba emailurilor și notificărilor").selectOption("en");
  await page.getByRole("button", { name: "Salvează", exact: true }).click();
  await expect
    .poll(async () => (await rest<{ locale: string; email_alerts: boolean }[]>(`profiles?select=locale,email_alerts&id=eq.${u.id}`))[0])
    .toEqual({ locale: "en", email_alerts: false });

  // The alerts page warns while the email switch is off.
  await page.goto("/ro/cont/alerte");
  await expect(page.getByText("Alertele pe email sunt oprite din setări.")).toBeVisible();
  await page.goto("/en/cont");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("My account");
  await noRawKeys(page);
});

test("favorites and history: product page, listing card, account pages, clear", async ({ page }) => {
  const u = await newUser("fav");
  await signInWithCode(page, u.email);
  await page.goto("/ro/cont/favorite");
  await expect(page.getByText("Nu ai încă produse favorite.")).toBeVisible();
  await page.goto("/ro/cont/istoric");
  await expect(page.getByText("Nu ai vizualizat încă niciun produs.")).toBeVisible();

  // From the product page.
  await page.goto(`/ro/p/${sampleSlug}`);
  const title = await page.getByRole("heading", { level: 1 }).innerText();
  await page.getByRole("button", { name: /la favorite$/ }).click();
  const remove = page.getByRole("button", { name: /din favorite$/ });
  await expect(remove).toBeVisible();
  await expect(remove).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.getByRole("button", { name: /din favorite$/ })).toBeVisible(); // persisted

  // From a listing card (a different product).
  await page.goto("/ro/cautare?q=samsung");
  const card = page.locator("main ul li").first();
  const cardHref = (await card.locator("a[href*='/ro/p/']").first().getAttribute("href"))!;
  await card.getByRole("button", { name: /la favorite$/ }).click();
  await expect(card.getByRole("button", { name: /din favorite$/ })).toBeVisible();

  await page.goto("/ro/cont/favorite");
  await expect(page.getByRole("link", { name: title })).toBeVisible();
  await expect(page.locator(`main a[href="${cardHref}"]`).first()).toBeVisible();
  expect((await rest<unknown[]>(`favorites?select=product_id&user_id=eq.${u.id}`)).length).toBe(2);
  // Remove from the account page.
  await page.getByRole("button", { name: /Scoate .* din favorite/ }).first().click();
  await expect(page.getByRole("button", { name: /Scoate .* din favorite/ })).toHaveCount(1);
  await expect.poll(async () => (await rest<unknown[]>(`favorites?select=product_id&user_id=eq.${u.id}`)).length).toBe(1);

  // History recorded for the product page views (after the response), then cleared.
  await expect
    .poll(async () => (await rest<unknown[]>(`view_history?select=product_id&user_id=eq.${u.id}`)).length)
    .toBeGreaterThanOrEqual(1);
  await page.goto("/ro/cont/istoric");
  await expect(page.getByRole("link", { name: title })).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Șterge tot istoricul" }).click();
  await expect(page.getByText("Nu ai vizualizat încă niciun produs.")).toBeVisible();
  expect((await rest<unknown[]>(`view_history?select=product_id&user_id=eq.${u.id}`)).length).toBe(0);

  // A signed-out visitor is sent to sign-in when favoriting.
  await signOut(page);
  await page.goto(`/ro/p/${sampleSlug}`);
  await expect(page.getByRole("link", { name: /favorit/i }).first()).toHaveAttribute("href", /autentificare/);
});

test("price alerts: validation, create, edit, pause, delete, 100 cap, wrong user", async ({ page }) => {
  const u = await newUser("alert");
  await signInWithCode(page, u.email);
  await page.goto(`/ro/p/${sampleSlug}`);
  await page.getByRole("button", { name: "Alertă de preț" }).click();
  const target = page.getByLabel("Preț țintă (lei)");
  const save = page.getByRole("button", { name: "Salvează alerta" });
  const dialog = page.locator("form").filter({ has: target });

  for (const bad of ["0", "-5", "abc", "12,345", "1e3", "99999999999", ""]) {
    await target.fill(bad);
    await save.click();
    if (bad === "") await expect(target).toBeFocused(); // native `required`
    else await expect(dialog.getByText(/Verifică datele introduse/)).toBeVisible();
  }
  expect((await rest<unknown[]>(`price_alerts?select=id&user_id=eq.${u.id}`)).length).toBe(0);

  // No channel selected.
  await target.fill("100");
  await dialog.getByLabel("Email").uncheck();
  await save.click();
  await expect(dialog.getByText(/Verifică datele introduse/)).toBeVisible();
  await dialog.getByLabel("Email").check();

  // Valid with Romanian decimal comma.
  await target.fill("1234,5");
  await save.click();
  await expect(page.getByRole("button", { name: "Modifică alerta" })).toBeVisible();
  await expect(page.getByText("Alertă activă la 1.234,50 lei")).toBeVisible();
  let rows = await rest<{ target_price: string; notify_email: boolean; is_active: boolean }[]>(
    `price_alerts?select=target_price,notify_email,is_active&user_id=eq.${u.id}`,
  );
  expect(rows).toHaveLength(1);
  expect(Number(rows[0].target_price)).toBe(1234.5);

  // Edit.
  await page.getByRole("button", { name: "Modifică alerta" }).click();
  await page.getByLabel("Preț țintă (lei)").fill("999");
  await page.getByRole("button", { name: "Salvează alerta" }).click();
  await expect(page.getByText("Alertă activă la 999,00 lei")).toBeVisible();

  // Account page: shows it, pause / resume, delete.
  await page.goto("/ro/cont/alerte");
  await a11yBasics(page);
  await expect(page.getByText("Activă, așteaptă prețul")).toBeVisible();
  await page.getByRole("button", { name: /^Oprește alerta/ }).click();
  await expect(page.getByText(/^Oprită/)).toBeVisible();
  await page.getByRole("button", { name: /^Pornește alerta/ }).click();
  await expect(page.getByText("Activă, așteaptă prețul")).toBeVisible();
  await page.getByRole("button", { name: /^Șterge alerta/ }).click();
  await expect(page.getByText("Nu ai alerte de preț.")).toBeVisible();
  rows = await rest(`price_alerts?select=target_price,notify_email,is_active&user_id=eq.${u.id}`);
  expect(rows).toHaveLength(0);

  // 100-alert cap: fill 99 through the API (35 sample + filler products), the 100th and 101st through the UI.
  const sample = await rest<{ id: number }[]>("products?select=id&status=eq.active&order=id");
  const need = 101 - sample.length;
  const fillers = await rest<{ id: number }[]>("products", {
    method: "POST",
    json: Array.from({ length: need }, (_, i) => ({ slug: `e2e-filler-${Date.now().toString(36)}-${i}`, title: `E2E filler ${i}` })),
  });
  fillerProducts.push(...fillers.map((f) => f.id));
  const all = [...sample.map((s) => s.id), ...fillers.map((f) => f.id)];
  await rest("price_alerts", {
    method: "POST",
    json: all.slice(0, 99).map((id) => ({ user_id: u.id, product_id: id, target_price: 10, notify_email: true })),
  });
  const slugOf = async (id: number) => (await rest<{ slug: string }[]>(`products?select=slug&id=eq.${id}`))[0].slug;
  await page.goto(`/ro/p/${await slugOf(all[99])}`);
  await page.getByRole("button", { name: "Alertă de preț" }).click();
  await page.getByLabel("Preț țintă (lei)").fill("10");
  await page.getByRole("button", { name: "Salvează alerta" }).click();
  await expect(page.getByRole("button", { name: "Modifică alerta" })).toBeVisible(); // the 100th is fine
  await page.goto(`/ro/p/${await slugOf(all[100])}`);
  await page.getByRole("button", { name: "Alertă de preț" }).click();
  await page.getByLabel("Preț țintă (lei)").fill("10");
  await page.getByRole("button", { name: "Salvează alerta" }).click();
  await expect(page.getByText("Ai atins limita de 100 de alerte.")).toBeVisible();
  expect((await rest<unknown[]>(`price_alerts?select=id&user_id=eq.${u.id}`)).length).toBe(100);
  void sampleId;
});

test("data export content, then account deletion removes everything", async ({ page }) => {
  const u = await newUser("del");
  await signInWithCode(page, u.email);
  await rest("favorites", { method: "POST", json: { user_id: u.id, product_id: sampleId } });
  await rest("price_alerts", { method: "POST", json: { user_id: u.id, product_id: sampleId, target_price: 5, notify_email: true } });
  await rest("view_history", { method: "POST", json: { user_id: u.id, product_id: sampleId } });

  await page.goto("/ro/cont");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /Descarcă datele/ }).or(page.getByRole("link", { name: /Descarcă datele/ })).click();
  const dl = await download;
  expect(dl.suggestedFilename()).toMatch(/\.json$/);
  const data = JSON.parse(await (await import("node:fs/promises")).readFile((await dl.path())!, "utf8"));
  expect(data.account.email).toBe(u.email);
  expect(data.account.id).toBe(u.id);
  expect(data.favorites).toHaveLength(1);
  expect(data.price_alerts).toHaveLength(1);
  expect(data.view_history).toHaveLength(1);
  expect(JSON.stringify(data)).not.toMatch(/p256dh|"auth"/);

  // Wrong confirmation keeps the account; the right one deletes it.
  const confirm = page.getByLabel(/Scrie adresa de email/);
  await confirm.fill("altcineva@example.test");
  await expect(page.getByRole("button", { name: "Șterge definitiv contul" })).toBeDisabled();
  expect((await rest<unknown[]>(`favorites?select=product_id&user_id=eq.${u.id}`)).length).toBe(1);
  await confirm.fill(u.email.toUpperCase());
  await page.getByRole("button", { name: "Șterge definitiv contul" }).click();
  await expect(page).toHaveURL(/\/ro$/);

  for (const t of ["favorites", "price_alerts", "view_history", "profiles"]) {
    const col = t === "profiles" ? "id" : "user_id";
    expect(await rest<unknown[]>(`${t}?select=*&${col}=eq.${u.id}`), t).toHaveLength(0);
  }
  await page.goto("/ro/cont");
  await expect(page).toHaveURL(/autentificare/);
  // The same address can sign up again as a brand-new account.
  await signInWithCode(page, u.email);
  const again = await rest<{ id: string }[]>(`profiles?select=id&id=neq.${u.id}&order=created_at.desc&limit=1`);
  expect(again.length).toBe(1);
  await page.goto("/ro/cont");
  page.once("dialog", (d) => d.accept());
  await page.getByLabel(/Scrie adresa de email/).fill(u.email);
  await page.getByRole("button", { name: "Șterge definitiv contul" }).click();
  await expect(page).toHaveURL(/\/ro$/);
});

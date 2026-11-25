import type { BrowserContext, Page } from "@playwright/test";
import { a11yBasics, expect, noRawKeys, test } from "./helpers/fixtures";
import { createUser, deleteUser, rest, type TestUser } from "./helpers/api";
import { ADMIN_PASSWORD, adminPage, createAdminSession, freshTotp, proxiedContext, type AdminSession } from "./helpers/admin";
import { signInWithCode, signInWithPassword } from "./helpers/ui";

// Admin (TOTP / aal2): access control, dashboard numbers, merchants + feeds (validation, run now -> worker -> run
// report), category mapping, users/roles, settings. A throw-away admin enrolls a fresh TOTP factor.
// Everything created here (merchants, feeds, mappings, products from the import) is removed in afterAll.

test.describe.configure({ mode: "serial" });

const RUN = Date.now().toString(36);
let admin: AdminSession;
let ctx: BrowserContext;
let page: Page;
const extraUsers: TestUser[] = [];
const merchantIds: number[] = [];

test.beforeAll(async ({ browser }) => {
  admin = await createAdminSession(browser);
  ({ context: ctx, page } = await adminPage(browser, admin));
});

test.afterAll(async () => {
  for (const id of merchantIds) {
    // Products only this merchant's offers created would stay orphaned: remove them first.
    const offers = await rest<{ product_id: number }[]>(`offers?select=product_id&merchant_id=eq.${id}`).catch(() => []);
    await rest(`merchants?id=eq.${id}`, { method: "DELETE" }).catch(() => undefined);
    for (const { product_id } of offers) {
      const left = await rest<{ id: number }[]>(`offers?select=id&product_id=eq.${product_id}&limit=1`).catch(() => [{ id: 0 }]);
      if (left.length === 0) await rest(`products?id=eq.${product_id}`, { method: "DELETE" }).catch(() => undefined);
    }
  }
  await ctx?.close();
  await deleteUser(admin?.user.id);
  for (const u of extraUsers) await deleteUser(u.id);
});

/** Submit a form skipping the browser validation, to reach the server-side checks. */
async function submitNoValidate(p: Page, form: ReturnType<Page["locator"]>) {
  await form.evaluate((f: HTMLFormElement) => {
    f.noValidate = true;
  });
  await form.getByRole("button", { name: /^(Salvează|Adaugă magazin|Adaugă feed)$/ }).click();
}

test("access: anonymous and normal users get 404, an admin without TOTP is stepped up", async ({ browser, request }) => {
  for (const path of ["/ro/admin", "/ro/admin/merchants", "/ro/admin/matching", "/en/admin/settings"]) {
    expect((await request.get(path)).status(), path).toBe(404);
  }
  const normal = await createUser("normal-e2e");
  extraUsers.push(normal);
  const nctx = await proxiedContext(browser);
  const np = await nctx.newPage();
  await signInWithCode(np, normal.email);
  for (const path of ["/ro/admin", "/ro/admin/users", "/ro/admin/mfa"]) {
    const r = await np.goto(path);
    expect(r?.status(), path).toBe(404);
  }
  await nctx.close();

  // Same admin, new session: password-less sign-in gives aal1 -> TOTP challenge.
  const actx = await proxiedContext(browser);
  const ap = await actx.newPage();
  await signInWithPassword(ap, admin.user.email, ADMIN_PASSWORD);
  await ap.goto("/ro/admin/feeds/1");
  await expect(ap).toHaveURL(/\/ro\/admin\/mfa$/);
  await a11yBasics(ap);
  await expect(ap.getByRole("heading", { level: 1 })).toHaveText("Cod de autentificare");
  await ap.getByLabel("Cod de 6 cifre").fill("12");
  await ap.getByRole("button", { name: "Verifică" }).click();
  expect(await ap.getByLabel("Cod de 6 cifre").evaluate((el: HTMLInputElement) => el.validity.patternMismatch)).toBe(true); // blocked by the browser
  await ap.getByLabel("Cod de 6 cifre").fill("000000");
  await ap.getByRole("button", { name: "Verifică" }).click();
  await expect(ap.getByText("Cod greșit sau expirat. Încearcă din nou.")).toBeVisible();
  expect((await ap.goto("/ro/admin"))?.url()).toMatch(/\/admin\/mfa$/); // still gated
  await ap.getByLabel("Cod de 6 cifre").fill(await freshTotp(admin.secret));
  await ap.getByRole("button", { name: "Verifică" }).click();
  await expect(ap.getByRole("heading", { level: 1, name: "Panou de administrare" })).toBeVisible();
  await actx.close();
});

test("every admin page (ro, en): one h1, labelled fields, no raw keys, no errors", async () => {
  const paths = ["", "/merchants", "/categories", "/categories?show=all", "/matching", "/reviews", "/users", "/settings"];
  for (const loc of ["ro", "en"]) {
    for (const p of paths) {
      const res = await page.goto(`/${loc}/admin${p}`);
      expect(res?.status(), `${loc}${p}`).toBe(200);
      expect(res?.headers()["cache-control"]).toContain("no-store");
      await a11yBasics(page);
      await noRawKeys(page);
    }
  }
  await page.goto("/ro/admin/merchants/999999");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible(); // 404 page
  expect((await page.goto("/ro/admin/merchants/abc"))?.status()).toBe(404);
  expect((await page.goto("/ro/admin/feeds/999999"))?.status()).toBe(404);
  expect((await page.goto("/ro/admin/runs/999999"))?.status()).toBe(404);
  expect((await page.goto("/ro/admin/products/999999"))?.status()).toBe(404);
});

test("dashboard numbers match the database", async () => {
  await page.goto("/ro/admin");
  const count = async (q: string) => (await rest<unknown[]>(q)).length;
  const expected: Record<string, number> = {
    "Produse active": await count("products?select=id&status=eq.active"),
    "Oferte active": await count("offers?select=id&is_active=eq.true"),
    "Surse de feed": await count("feed_sources?select=id"),
    "Potriviri de verificat": await count("match_queue?select=id&status=eq.open"),
    "Categorii nemapate": await count("category_mappings?select=id&category_id=is.null"),
    "Recenzii în așteptare": await count("reviews?select=id&status=eq.pending"),
    "Sesizări deschise": await count("review_reports?select=id&status=eq.open"),
  };
  for (const [label, n] of Object.entries(expected)) {
    const card = page.locator("div, a").filter({ has: page.getByText(label, { exact: true }) }).last();
    const value = (await card.locator("span").first().innerText()).replace(/\D/g, "");
    expect(Number(value), label).toBe(n);
  }
  await expect(page.getByRole("heading", { name: "Ultimele importuri" })).toBeVisible();
});

test("merchant: create, server-side validation, edit, deactivate", async () => {
  await page.goto("/ro/admin/merchants");
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Adaugă magazin" }) });
  const open = page.getByText("Adaugă magazin").first();
  if (await open.evaluate((el) => el.tagName === "SUMMARY")) await open.click();

  // Server-side checks (browser validation bypassed).
  const fill = async (o: { name: string; slug: string; website: string; network?: string; affiliate?: boolean }) => {
    await form.getByLabel("Nume", { exact: true }).fill(o.name);
    await form.getByLabel("Slug (URL)").fill(o.slug);
    await form.getByLabel("Site").fill(o.website);
    await form.getByLabel("Rețea de afiliere").selectOption(o.network ?? "");
    const aff = form.getByLabel("Relație de afiliere");
    if (o.affiliate) await aff.check();
    else await aff.uncheck();
  };
  for (const bad of [
    { name: "x", slug: "ok-slug", website: "https://a.example" }, // name too short
    { name: "E2E Bad", slug: "Bad Slug!", website: "https://a.example" },
    { name: "E2E Bad", slug: "ok-slug", website: "ftp://a.example" },
    { name: "E2E Bad", slug: "ok-slug", website: "nu-este-url" },
    { name: "E2E Bad", slug: "ok-slug", website: "https://a.example", affiliate: true }, // affiliate needs a network
  ]) {
    await page.goto("/ro/admin/merchants");
    if (await open.evaluate((el) => el.tagName === "SUMMARY")) await open.click();
    await fill(bad);
    await submitNoValidate(page, form);
    await expect(page.locator("p[role=alert]")).toContainText("Date invalide", { timeout: 15_000 });
  }
  expect(await rest<unknown[]>(`merchants?select=id&slug=in.(ok-slug,bad-slug)`)).toHaveLength(0);

  const slug = `e2e-adm-${RUN}`;
  await page.goto("/ro/admin/merchants");
  if (await open.evaluate((el) => el.tagName === "SUMMARY")) await open.click();
  await fill({ name: `E2E Admin Shop ${RUN}`, slug, website: "https://shop.example", network: "profitshare", affiliate: true });
  await form.getByRole("button", { name: "Adaugă magazin" }).click();
  await expect(page.getByRole("status")).toContainText("Creat.");
  const [m] = await rest<{ id: number; has_affiliate: boolean; affiliate_network: string }[]>(
    `merchants?select=id,has_affiliate,affiliate_network&slug=eq.${slug}`,
  );
  merchantIds.push(m.id);
  expect(m).toMatchObject({ has_affiliate: true, affiliate_network: "profitshare" });

  // Duplicate slug.
  await page.goto("/ro/admin/merchants");
  if (await open.evaluate((el) => el.tagName === "SUMMARY")) await open.click();
  await fill({ name: "Duplicat", slug, website: "https://shop.example" });
  await form.getByRole("button", { name: "Adaugă magazin" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("Există deja");

  // Edit + deactivate / activate.
  await page.goto(`/ro/admin/merchants/${m.id}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`E2E Admin Shop ${RUN}`);
  const edit = page.locator("section[aria-labelledby=edit-h] form");
  await edit.getByLabel("Informații livrare").fill("Livrare 2-3 zile");
  await edit.getByRole("button", { name: "Salvează" }).click();
  await expect(page.getByRole("status")).toContainText("Salvat.");
  expect((await rest<{ shipping_info: string }[]>(`merchants?select=shipping_info&id=eq.${m.id}`))[0].shipping_info).toBe("Livrare 2-3 zile");
  await page.getByRole("button", { name: "Dezactivează", exact: true }).click();
  await expect(page.getByRole("button", { name: "Activează", exact: true })).toBeVisible();
  expect((await rest<{ is_active: boolean }[]>(`merchants?select=is_active&id=eq.${m.id}`))[0].is_active).toBe(false);
  expect((await page.request.get(`/ro/magazin/${slug}`)).status()).toBe(404); // inactive shops are not public
  await page.getByRole("button", { name: "Activează", exact: true }).click();
  await expect(page.getByRole("button", { name: "Dezactivează", exact: true })).toBeVisible();
});

test("feed: validation, create, run now -> worker -> run report and row errors", async () => {
  test.setTimeout(240_000);
  const [m] = await rest<{ id: number }[]>(`merchants?select=id&slug=eq.e2e-adm-${RUN}`);
  await page.goto(`/ro/admin/merchants/${m.id}`);
  const createForm = () => page.locator("details", { hasText: "Adaugă feed" }).locator("form");
  const openCreate = async () => {
    await page.goto(`/ro/admin/merchants/${m.id}`);
    await page.locator("summary", { hasText: "Adaugă feed" }).click();
  };
  const fill = async (o: { name: string; url: string; options?: string; schedule?: string; type?: string }) => {
    const f = createForm();
    await f.getByLabel("Nume", { exact: true }).fill(o.name);
    await f.getByLabel("Tip").selectOption(o.type ?? "direct_csv");
    await f.getByLabel("URL feed").fill(o.url);
    await f.getByLabel("Opțiuni (JSON)").fill(o.options ?? "");
    await f.getByLabel("Interval (minute)").fill(o.schedule ?? "360");
  };
  const good = "https://fixtures.invalid/direct-bad.csv";
  for (const bad of [
    { name: "F", url: "nu-este-url" },
    { name: "F", url: "ftp://x.example/feed.csv" },
    { name: "F", url: good, options: "{nu e json" },
    { name: "F", url: good, options: "[1,2]" },
    { name: "F", url: good, options: '"text"' },
    { name: "F", url: good, schedule: "14" },
    { name: "F", url: good, schedule: "10081" },
    { name: "", url: good },
  ]) {
    await openCreate();
    await fill(bad);
    await submitNoValidate(page, createForm());
    await expect(page.locator("p[role=alert]"), JSON.stringify(bad)).toContainText("Date invalide", { timeout: 15_000 });
  }
  expect(await rest<unknown[]>(`feed_sources?select=id&merchant_id=eq.${m.id}`)).toHaveLength(0);

  // Boundaries that are valid: 15 and 10080 minutes.
  for (const schedule of ["15", "10080"]) {
    await openCreate();
    await fill({ name: `Limit ${schedule}`, url: good, options: '{"delimiter":";"}', schedule });
    await createForm().getByRole("button", { name: "Adaugă feed" }).click();
    await expect(page.getByRole("status")).toContainText("Creat.");
  }
  const feeds = await rest<{ id: number; name: string; schedule_minutes: number }[]>(`feed_sources?select=id,name,schedule_minutes&merchant_id=eq.${m.id}&order=id`);
  expect(feeds.map((f) => f.schedule_minutes)).toEqual([15, 10080]);

  // Edit one, then run it now.
  const feed = feeds[0];
  await page.goto(`/ro/admin/merchants/${m.id}`);
  const card = page.locator("article").filter({ hasText: "Limit 15" });
  await card.locator("summary", { hasText: "Editează" }).click();
  await card.getByLabel("Nume", { exact: true }).fill("Feed E2E csv");
  await card.getByRole("button", { name: "Salvează" }).click();
  await expect(page.getByRole("status")).toContainText("Salvat.");
  await expect(page.locator("article").filter({ hasText: "Feed E2E csv" })).toBeVisible();

  await page.locator("article").filter({ hasText: "Feed E2E csv" }).getByRole("button", { name: "Rulează acum" }).click();
  await expect(page.getByRole("status")).toContainText(/pus în coadă/);
  // A second request while one is pending is refused (button disabled / "În coadă").
  await expect(page.locator("article").filter({ hasText: "Feed E2E csv" }).getByRole("button", { name: "În coadă" })).toBeDisabled();

  await expect
    .poll(async () => (await rest<{ status: string }[]>(`feed_runs?select=status&feed_source_id=eq.${feed.id}`))[0]?.status, {
      timeout: 150_000,
      intervals: [3000],
    })
    .toMatch(/^(ok|partial)$/);
  const [run] = await rest<{ id: number; status: string; rows_read: number; rows_invalid: number }[]>(
    `feed_runs?select=id,status,rows_read,rows_invalid&feed_source_id=eq.${feed.id}`,
  );
  expect(run.rows_read).toBe(5);
  expect(run.rows_invalid).toBe(3);

  // Run report + row errors.
  await page.goto(`/ro/admin/feeds/${feed.id}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Feed E2E csv");
  await page.getByRole("link", { name: /\d{2}\.\d{2}\.\d{4}/ }).first().click();
  await expect(page).toHaveURL(new RegExp(`/ro/admin/runs/${run.id}$`));
  await expect(page.getByRole("heading", { level: 1 })).toContainText(`#${run.id}`);
  await expect(page.getByText("Erori (3)")).toBeVisible();
  await a11yBasics(page);
  await noRawKeys(page);
  const errors = await rest<{ field: string }[]>(`feed_run_errors?select=field&run_id=eq.${run.id}`);
  expect(errors).toHaveLength(3);
  // The merchant page shows the last run and the queue button is enabled again.
  await page.goto(`/ro/admin/merchants/${m.id}`);
  await expect(page.locator("article").filter({ hasText: "Feed E2E csv" }).getByRole("button", { name: "Rulează acum" })).toBeEnabled();
});

test("category mapping: single, bulk, unmap leaves products alone", async () => {
  const [m] = await rest<{ id: number }[]>(`merchants?select=id&slug=eq.e2e-adm-${RUN}`);
  const [cat] = await rest<{ id: number; path: string }[]>("categories?select=id,path&path=eq.telefoane-tablete/telefoane-mobile");
  const [cat2] = await rest<{ id: number; path: string }[]>("categories?select=id,path&path=eq.tv-audio-foto/televizoare");
  const mk = async (key: string) => {
    const [p] = await rest<{ id: number }[]>("products", {
      method: "POST",
      json: { slug: `e2e-map-${key.toLowerCase()}-${RUN}`, title: `E2E Map ${key} ${RUN}` },
    });
    await rest("offers", {
      method: "POST",
      json: { merchant_id: m.id, product_id: p.id, external_id: `map-${key}-${RUN}`, title: `o ${key}`, url: "https://shop.example/x", price: 10, category_raw: `E2E > ${key} ${RUN}` },
    });
    await rest("category_mappings", { method: "POST", json: { merchant_id: m.id, source_path: `E2E > ${key} ${RUN}`, offer_count: 1 } });
    return p.id;
  };
  const pa = await mk("A");
  const pb = await mk("B");
  const pc = await mk("C");
  const catOf = async (id: number) => (await rest<{ category_id: number | null }[]>(`products?select=category_id&id=eq.${id}`))[0].category_id;

  await page.goto(`/ro/admin/categories?merchant=${m.id}`);
  await expect(page.getByRole("checkbox", { name: `E2E > A ${RUN}` })).toBeVisible();
  const submit = (op: "Atribuie" | "Elimină maparea") => page.getByRole("button", { name: op });

  // Nothing selected / no category chosen: nothing changes.
  await submit("Atribuie").click();
  await expect(page.locator("p[role=alert]").or(page.getByRole("status"))).toBeVisible();
  expect(await catOf(pa)).toBeNull();

  // Single mapping.
  await page.getByRole("checkbox", { name: `E2E > A ${RUN}` }).check();
  await page.getByLabel("Categorie pentru rândurile selectate").fill(cat.path);
  await submit("Atribuie").click();
  await expect(page.getByRole("status")).toContainText("Maparea categoriilor a fost salvată.");
  expect(await catOf(pa)).toBe(cat.id);
  expect(await catOf(pb)).toBeNull();

  // Bulk: select all remaining, unknown category refused, then valid.
  await page.goto(`/ro/admin/categories?merchant=${m.id}`);
  await page.getByLabel("Selectează tot").check();
  await page.getByLabel("Categorie pentru rândurile selectate").fill("nu/exista");
  await submit("Atribuie").click();
  await expect(page.locator("p[role=alert]")).toBeVisible();
  expect(await catOf(pb)).toBeNull();
  await page.getByLabel("Selectează tot").check();
  await page.getByLabel("Categorie pentru rândurile selectate").fill(cat2.path);
  await submit("Atribuie").click();
  await expect(page.getByRole("status")).toContainText("salvată");
  expect(await catOf(pb)).toBe(cat2.id);
  expect(await catOf(pc)).toBe(cat2.id);
  expect(await catOf(pa)).toBe(cat.id); // never overwritten

  // Unmap: mapping becomes unmapped again, products keep their category.
  await page.goto(`/ro/admin/categories?merchant=${m.id}&show=all`);
  await page.getByRole("checkbox", { name: `E2E > B ${RUN}` }).check();
  await submit("Elimină maparea").click();
  await expect(page.getByRole("status")).toContainText("salvată");
  expect(await catOf(pb)).toBe(cat2.id);
  const maps = await rest<{ category_id: number | null; source_path: string }[]>(
    `category_mappings?select=category_id,source_path&merchant_id=eq.${m.id}&source_path=eq.${encodeURIComponent(`E2E > B ${RUN}`)}`,
  );
  expect(maps[0].category_id).toBeNull();
  await rest(`products?id=in.(${pa},${pb},${pc})`, { method: "DELETE" });
});

test("settings: validation and persistence", async () => {
  await page.goto("/ro/admin/settings");
  const [before] = await rest<{ value: unknown }[]>("settings?select=value&key=eq.mpn_min_length");
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Salvează" }) });
  const save = () => form.getByRole("button", { name: "Salvează" }).click();
  const field = (k: string) => form.locator(`[name=${k}]`);

  await form.evaluate((f: HTMLFormElement) => {
    f.noValidate = true;
  });
  for (const [k, v] of [
    ["mpn_min_length", "0"],
    ["mpn_min_length", "21"],
    ["mpn_min_length", "2.5"],
    ["match_auto", "1.2"],
    ["feed_min_ratio", "-1"],
    ["allowed_currencies", "lei"],
  ]) {
    const original = await field(k).inputValue();
    await field(k).fill(v);
    await save();
    await expect(page.locator("p[role=alert]"), `${k}=${v}`).toContainText("Date invalide", { timeout: 15_000 });
    await page.goto("/ro/admin/settings");
    expect(await form.locator(`[name=${k}]`).inputValue()).toBe(original);
    await form.evaluate((f: HTMLFormElement) => {
      f.noValidate = true;
    });
  }
  // review must stay below auto.
  const auto = await field("match_auto").inputValue();
  await field("match_review").fill(auto);
  await save();
  await expect(page.locator("p[role=alert]")).toContainText("Date invalide");

  await page.goto("/ro/admin/settings");
  await field("mpn_min_length").fill(String(Number((before.value as number) ?? 4)));
  await save();
  await expect(page.getByRole("status")).toContainText("Salvat.");
  expect((await rest<{ value: unknown }[]>("settings?select=value&key=eq.mpn_min_length"))[0].value).toEqual(before.value);
});

test("users: list, search, grant and revoke admin (never your own)", async () => {
  const target = await createUser("grant-e2e");
  extraUsers.push(target);
  await page.goto("/ro/admin/users");
  await a11yBasics(page);
  const mine = page.getByRole("row").filter({ hasText: admin.user.email });
  await expect(mine.getByText("(tu)")).toBeVisible();
  await expect(mine.getByRole("button")).toHaveCount(0); // no revoke on yourself

  await page.getByLabel("Caută după e-mail").fill(target.email);
  await page.locator("main").getByRole("button", { name: "Filtrează" }).click();
  const row = page.getByRole("row").filter({ hasText: target.email });
  await page.waitForURL(/q=/);
  await expect(row).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: admin.user.email })).toHaveCount(0);
  await row.getByRole("button", { name: "Fă admin" }).click();
  await expect(page.getByRole("status")).toContainText("Rolul a fost modificat.");
  expect(await rest<unknown[]>(`user_roles?select=user_id&user_id=eq.${target.id}&role=eq.admin`)).toHaveLength(1);
  await page.getByRole("row").filter({ hasText: target.email }).getByRole("button", { name: "Retrage admin" }).click();
  await expect(page.getByRole("status")).toContainText("Rolul a fost modificat.");
  await expect.poll(async () => (await rest<unknown[]>(`user_roles?select=user_id&user_id=eq.${target.id}`)).length).toBe(0);
  // Every change is logged.
  const log = await rest<{ action: string }[]>(`moderation_log?select=action&actor_id=eq.${admin.user.id}&order=id`);
  expect(log.length).toBeGreaterThan(3);
});

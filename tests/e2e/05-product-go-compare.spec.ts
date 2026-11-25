import { expect, test } from "./helpers/fixtures";
import { rest } from "./helpers/api";

// Product page rules (ranking order, shipping label, affiliate marking, Omnibus), /go click redirect, compare.
// Uses a dedicated fixture product + merchants (created here, deleted in afterAll); the sample catalog is read-only.

const RUN = Date.now().toString(36);
const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();
const created = { merchants: [] as number[], productId: 0 };
let slug = "";
const ids: Record<string, number> = {};

type Row = { id: number };

test.beforeAll(async () => {
  slug = `e2e-fixture-${RUN}`;
  const [p] = await rest<Row[]>("products", { method: "POST", json: { slug, title: `E2E Fixture ${RUN}` } });
  created.productId = p.id;
  const mk = async (name: string) => {
    const [m] = await rest<Row[]>("merchants", {
      method: "POST",
      json: { slug: `e2e-${name.toLowerCase()}-${RUN}`, name: `E2E ${name} ${RUN}`, website: "https://shop.example" },
    });
    created.merchants.push(m.id);
    return m.id;
  };
  const offer = async (key: string, merchant: number, o: Record<string, unknown>) => {
    const [r] = await rest<Row[]>("offers", {
      method: "POST",
      json: {
        merchant_id: merchant,
        product_id: p.id,
        external_id: `${key}-${RUN}`,
        title: `Fixture offer ${key}`,
        url: `https://shop.example/${key}`,
        availability: "in_stock",
        ...o,
      },
    });
    ids[key] = r.id;
    return r.id;
  };
  const hist = (offerId: number, price: number, ago: number) =>
    rest("price_history", {
      method: "POST",
      json: { offer_id: offerId, product_id: p.id, price, availability: "in_stock", recorded_at: iso(ago) },
    });

  // A: affiliate, shipping unknown, full 30-day history 100 -> 80 (reduction 20 %); feed old_price must be ignored.
  const a = await offer("A", await mk("Alpha"), {
    price: 80,
    old_price: 150,
    affiliate_url: "https://track.example/a",
    first_seen_at: iso(45),
  });
  await hist(a, 120, 40);
  await hist(a, 100, 20);
  await hist(a, 80, 0.04);
  // B: free shipping, short history (5 days): 100 -> 90 (partial label).
  const b = await offer("B", await mk("Beta"), { price: 90, shipping_cost: 0, first_seen_at: iso(5) });
  await hist(b, 100, 5);
  await hist(b, 90, 0.04);
  // C: feed claims old_price 200 but we have no history: no reduction may be shown.
  await offer("C", await mk("Gamma"), { price: 95, old_price: 200, first_seen_at: iso(1) });
  // Total 100 tie group: in-stock offers by name; the out-of-stock one last.
  await offer("D", await mk("Zeta"), { price: 85, shipping_cost: 15 });
  await offer("E", await mk("Aaa"), { price: 100, availability: "out_of_stock" });
  await offer("F", await mk("Bbb"), { price: 100 });
  await offer("G", await mk("Ccc"), { price: 100 });
  // H: inactive offer (never listed, /go must 404).
  await offer("H", await mk("Hidden"), { price: 10, is_active: false });
});

test.afterAll(async () => {
  if (created.productId) {
    await rest(`clicks?product_id=eq.${created.productId}`, { method: "DELETE" }).catch(() => undefined);
    await rest(`products?id=eq.${created.productId}`, { method: "DELETE" }).catch(() => undefined);
  }
  for (const m of created.merchants) await rest(`merchants?id=eq.${m}`, { method: "DELETE" }).catch(() => undefined);
});

const offerLis = (page: import("@playwright/test").Page) => page.getByTestId("offer");

test("offers: ranking order, tie rules, shipping label, affiliate marking, Omnibus", async ({ page }) => {
  await page.goto(`/ro/p/${slug}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`E2E Fixture ${RUN}`);
  const lis = offerLis(page);
  await expect(lis).toHaveCount(7); // H is inactive

  // Order: A 80, B 90, C 95, then total 100: in stock by merchant name (D total 100 = 85 + 15, F, G), out of stock last.
  const names = await lis.locator("a[href^='/ro/magazin/']").allInnerTexts();
  expect(names.map((n) => n.replace(` ${RUN}`, ""))).toEqual([
    "E2E Alpha",
    "E2E Beta",
    "E2E Gamma",
    "E2E Bbb",
    "E2E Ccc",
    "E2E Zeta",
    "E2E Aaa",
  ]);

  const a = lis.nth(0);
  await expect(a).toContainText("cost livrare nespecificat");
  await expect(a).toContainText("Link afiliat");
  expect(await a.getByRole("link", { name: /Vezi oferta/ }).getAttribute("rel")).toBe("sponsored nofollow noopener");
  // Omnibus: reference = our lowest of the previous 30 days (100), never the feed's old_price (150).
  await expect(a).toContainText("−20%");
  await expect(a).toContainText("100,00 lei");
  await expect(a).not.toContainText("150,00");
  await expect(a).toContainText("Cel mai mic preț din ultimele 30 de zile: 100,00 lei");

  const b = lis.nth(1);
  await expect(b).toContainText("Livrare gratuită");
  await expect(b).not.toContainText("Link afiliat");
  expect(await b.getByRole("link", { name: /Vezi oferta/ }).getAttribute("rel")).toBe("nofollow noopener");
  await expect(b).toContainText("−10%");
  await expect(b).toContainText(/ultimele 5 zile \(de când urmărim oferta\)/);

  const c = lis.nth(2);
  await expect(c).not.toContainText("−");
  expect(await c.locator("s").count()).toBe(0);
  await expect(c).not.toContainText("200,00");

  await expect(lis.nth(5)).toContainText("Total: 100,00 lei"); // D: 85 + 15 shipping
  await expect(lis.nth(5)).toContainText("Livrare: 15,00 lei");
  await expect(lis.nth(6)).toContainText("Stoc epuizat");

  await expect(page.locator("main").getByText("Comisioanele nu influențează ordinea")).toBeVisible();
  await page.getByRole("link", { name: "Cum ordonăm", exact: true }).click();
  await expect(page).toHaveURL(/\/ro\/cum-ordonam$/);
});

test("price chart, table toggle, headline price range, JSON-LD", async ({ page, request }) => {
  await page.goto(`/ro/p/${slug}`);
  const chart = page.getByRole("img", { name: /cel mai mic preț zilnic a variat/ });
  await expect(chart).toBeVisible();
  const toggle = page.getByText("Vezi datele ca tabel");
  await toggle.click();
  const table = page.getByRole("table", { name: "Modificările celui mai mic preț pe zi" });
  await expect(table).toBeVisible();
  expect(await table.locator("tbody tr").count()).toBeGreaterThan(1);
  await expect(page.locator("article p.text-lg")).toHaveText(/Între 80,00\s+lei și 100,00\s+lei \(7 oferte\)/);

  const html = await (await request.get(`/ro/p/${slug}`)).text();
  const blocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
  const product = blocks.find((b) => b["@type"] === "Product");
  expect(product).toBeTruthy();
  expect(product["@context"]).toBe("https://schema.org");
  expect(product.name).toBe(`E2E Fixture ${RUN}`);
  expect(product.offers["@type"]).toBe("AggregateOffer");
  expect(product.offers.priceCurrency).toBe("RON");
  expect(product.offers.lowPrice).toBe("80.00");
  expect(product.offers.highPrice).toBe("100.00");
  expect(product.offers.offerCount).toBe(7);
  expect(product.url).toContain(`/ro/p/${slug}`);
  expect(html).toMatch(new RegExp(`<link rel="canonical" href="[^"]*/ro/p/${slug}"`));
  expect(html).toMatch(new RegExp(`<link rel="alternate" hrefLang="en" href="[^"]*/en/p/${slug}"`));
  expect(html).toMatch(new RegExp(`<link rel="alternate" hrefLang="ro" href="[^"]*/ro/p/${slug}"`));
  expect(html).toMatch(/noindex/); // DEV
});

test("english product page", async ({ page }) => {
  await page.goto(`/en/p/${slug}`);
  await expect(page.getByTestId("offer").first()).toContainText("shipping cost not specified");
  await expect(page.getByTestId("offer").first()).toContainText("Affiliate link");
  await expect(page.getByTestId("offer").first()).toContainText(/RON\s?100\.00/);
  await expect(page.getByTestId("offer").first()).toContainText(/Lowest price in the last 30 days/i);
});

test("/go: 302, no-store, noindex, click counted; invalid, unknown and inactive offers 404", async ({ request }) => {
  const count = async () => {
    const r = await rest<Row[]>(`clicks?select=id&offer_id=eq.${ids.A}`);
    return r.length;
  };
  const before = await count();
  const res = await request.get(`/go/${ids.A}?s=product`, { maxRedirects: 0 });
  expect(res.status()).toBe(302);
  expect(res.headers()["location"]).toBe("https://track.example/a"); // affiliate URL wins
  expect(res.headers()["cache-control"]).toContain("no-store");
  expect(res.headers()["x-robots-tag"]).toContain("noindex");
  expect(await count()).toBe(before + 1);

  // Plain offer goes to the shop URL; unknown source is stored as "other".
  const plain = await request.get(`/go/${ids.B}?s=%3Cscript%3E`, { maxRedirects: 0 });
  expect(plain.status()).toBe(302);
  expect(plain.headers()["location"]).toBe("https://shop.example/B");
  const rows = await rest<{ source: string; is_bot: boolean }[]>(`clicks?select=source,is_bot&offer_id=eq.${ids.B}`);
  expect(rows).toHaveLength(1);
  expect(rows[0].source).toBe("other");
  // Click rows carry no personal data columns.
  const cols = Object.keys((await rest<Record<string, unknown>[]>(`clicks?limit=1&offer_id=eq.${ids.B}`))[0]);
  expect(cols.sort()).toEqual(["clicked_at", "id", "is_bot", "merchant_id", "offer_id", "product_id", "source"]);

  for (const bad of [String(ids.H), "999999999999", "abc", "0", "-1", "1e3", "12345678901234567890"]) {
    const r = await request.get(`/go/${bad}`, { maxRedirects: 0 });
    expect(r.status(), bad).toBe(404);
    expect(r.headers()["cache-control"], bad).toContain("no-store");
    expect(r.headers()["x-robots-tag"], bad).toContain("noindex");
  }
  const inactiveClicks = await rest<Row[]>(`clicks?select=id&offer_id=eq.${ids.H}`);
  expect(inactiveClicks).toHaveLength(0);

  // Bots are stored but flagged.
  const bot = await request.get(`/go/${ids.C}`, { maxRedirects: 0, headers: { "user-agent": "Googlebot/2.1" } });
  expect(bot.status()).toBe(302);
  const botRow = await rest<{ is_bot: boolean }[]>(`clicks?select=is_bot&offer_id=eq.${ids.C}`);
  expect(botRow[0].is_bot).toBe(true);
});

test("compare: add, limit of 4, remove, persist, clear, compare page", async ({ page }) => {
  await page.goto("/ro/cautare");
  const toggles = page.getByRole("checkbox", { name: /^Adaugă .* la comparație$/ });
  await toggles.nth(0).check();
  const bar = page.getByRole("region", { name: "Comparație produse" });
  await expect(bar).toContainText("1 din 4 produse selectate");
  await expect(bar).toContainText("Alege cel puțin 2 produse.");
  await expect(bar.getByRole("link", { name: "Compară acum" })).toHaveCount(0);
  await toggles.nth(1).check();
  await expect(bar.getByRole("link", { name: "Compară acum" })).toBeVisible();
  await toggles.nth(2).check();
  await toggles.nth(3).check();
  await expect(bar).toContainText("4 din 4 produse selectate");
  await toggles.nth(4).evaluate((el) => (el as HTMLInputElement).click()); // the sticky bar may cover it
  await expect(page.getByText("Poți compara cel mult 4 produse.")).toBeVisible();
  await expect(bar).toContainText("4 din 4 produse selectate");
  await expect(toggles.nth(4)).not.toBeChecked();

  // Persists across reload and navigation.
  await page.reload();
  await expect(page.getByRole("region", { name: "Comparație produse" })).toContainText("4 din 4");
  // Remove one.
  await toggles.nth(0).uncheck();
  await expect(page.getByRole("region", { name: "Comparație produse" })).toContainText("3 din 4");

  await page.getByRole("link", { name: "Compară acum" }).click();
  await expect(page).toHaveURL(/\/ro\/comparare\?p=/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const table = page.getByRole("table");
  await expect(table.locator("thead th")).toHaveCount(4); // attribute column + 3 products
  await expect(table.getByRole("rowheader", { name: "Cel mai bun preț" })).toBeVisible();
  for (const cell of await table.locator("tbody tr").first().locator("td").allInnerTexts()) expect(cell).toMatch(/lei/);

  await page.getByRole("button", { name: "Golește" }).click();
  await expect(page.getByRole("region", { name: "Comparație produse" })).toHaveCount(0);
});

test("compare page: 1, 2, 4 products, bad and duplicate slugs", async ({ page }) => {
  const prods = await rest<{ slug: string }[]>("products?select=slug&status=eq.active&offer_count=gt.0&order=id&limit=6");
  const s = prods.map((p) => p.slug);
  const cols = async (qs: string) => {
    const res = await page.goto(`/ro/comparare${qs}`);
    expect(res?.status(), qs).toBe(200);
    return page.getByRole("table").locator("thead th").count();
  };
  expect(await cols(`?p=${s[0]},${s[1]}`)).toBe(3);
  expect(await cols(`?p=${s.slice(0, 4).join(",")}`)).toBe(5);
  expect(await cols(`?p=${s.slice(0, 6).join(",")}`)).toBe(5); // capped at 4
  expect(await cols(`?p=${s[0]},${s[0]},${s[1]}`)).toBe(3); // duplicates collapsed

  for (const qs of [`?p=${s[0]}`, "?p=", "?p=nu-exista,alt-nu-exista", `?p=${s[0]},nu-exista`, "?p=../../etc/passwd,<x>", "?p=A,B"]) {
    const res = await page.goto(`/ro/comparare${qs}`);
    expect(res?.status(), qs).toBe(200);
    await expect(page.getByText("Alege 2–4 produse")).toBeVisible();
  }
});

test("merchant page and static trust pages", async ({ page }) => {
  await page.goto(`/ro/magazin/megashop-test`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Megashop");
  await page.goto("/ro/cum-ordonam");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator("main")).toContainText(/pre[țt]ul total/i);
  await page.goto("/ro/despre-afiliere");
  await expect(page.locator("main")).toContainText(/afiliat/i);
});

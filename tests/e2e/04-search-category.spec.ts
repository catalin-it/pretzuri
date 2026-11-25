import { expect, test } from "./helpers/fixtures";
import { rest } from "./helpers/api";

// Search + category listings: sort, price filters (valid / inverted / negative / non-numeric), brand and shop
// filters, spec filters, pagination, empty state, XSS-safe query echo.

/** "de la 2.799,00 lei" -> 2799 (ro) */
function priceOf(text: string): number {
  const m = text.match(/(\d{1,3}(?:\.\d{3})*,\d{2})/);
  if (!m) throw new Error(`no price in "${text}"`);
  return Number(m[1].replace(/\./g, "").replace(",", "."));
}

async function cardPrices(page: import("@playwright/test").Page): Promise<number[]> {
  const cards = page.locator("main ul li", { has: page.locator("a[href*='/ro/p/']") });
  const texts = await cards.allInnerTexts();
  return texts.map(priceOf);
}

test("sort: every option orders correctly", async ({ page }) => {
  await page.goto("/ro/cautare?q=samsung");
  const sort = page.getByLabel("Ordonează");
  const options = await sort.locator("option").allInnerTexts();
  expect(options).toEqual(["Relevanță", "Preț crescător", "Preț descrescător", "Cele mai multe oferte", "Cele mai noi"]);

  await sort.selectOption("price_asc"); // auto-submits
  await expect(page).toHaveURL(/sort=price_asc/);
  const asc = await cardPrices(page);
  expect(asc.length).toBeGreaterThan(1);
  expect(asc).toEqual([...asc].sort((a, b) => a - b));

  await page.getByLabel("Ordonează").selectOption("price_desc");
  await expect(page).toHaveURL(/sort=price_desc/);
  const desc = await cardPrices(page);
  expect(desc).toEqual([...desc].sort((a, b) => b - a));

  await page.getByLabel("Ordonează").selectOption("offers");
  await expect(page).toHaveURL(/sort=offers/);
  await page.getByLabel("Ordonează").selectOption("newest");
  await expect(page).toHaveURL(/sort=newest/);
  await expect(page.getByLabel("Ordonează")).toHaveValue("newest");
  await expect(page.locator("main ul li a[href*='/ro/p/']").first()).toBeVisible();

  // Without a query there is no "relevance" option; invalid sort falls back silently.
  await page.goto("/ro/cautare?sort=bogus");
  await expect(page.getByLabel("Ordonează").locator("option")).toHaveCount(4);
  await expect(page.getByLabel("Ordonează")).toHaveValue("offers");
});

test("price filter: valid, inverted, negative, non-numeric, no match", async ({ page }) => {
  await page.goto("/ro/cautare?pret_min=1000&pret_max=3000");
  const prices = await cardPrices(page);
  expect(prices.length).toBeGreaterThan(0);
  for (const p of prices) {
    expect(p).toBeGreaterThanOrEqual(1000);
    expect(p).toBeLessThanOrEqual(3000);
  }
  const normalCount = await page.getByRole("status").first().innerText();

  // Inverted range is swapped, not an error.
  await page.goto("/ro/cautare?pret_min=3000&pret_max=1000");
  await expect(page.getByRole("status").first()).toHaveText(normalCount);

  // Negative and non-numeric values are ignored (same as no filter), never a 500.
  await page.goto("/ro/cautare");
  const all = await page.getByRole("status").first().innerText();
  for (const q of ["pret_min=-5", "pret_min=abc&pret_max=xyz", "pret_max=1e9999", "pret_min=%00", "pret_min=1,5.5.5"]) {
    const res = await page.goto(`/ro/cautare?${q}`);
    expect(res?.status(), q).toBe(200);
    await expect(page.getByRole("status").first(), q).toHaveText(all);
  }

  // Nothing that cheap: empty state with the "filtered" hint and a reset link.
  await page.goto("/ro/cautare?pret_min=0&pret_max=1");
  await expect(page.getByRole("heading", { name: "Nu am găsit produse" })).toBeVisible();
  await expect(page.getByText("Încearcă să elimini unele filtre")).toBeVisible();
  await page.getByRole("link", { name: "Șterge filtrele" }).click();
  await expect(page).toHaveURL(/\/ro\/cautare$/);
});

test("price form (UI): fill, apply, reset", async ({ page }) => {
  await page.goto("/ro/cautare");
  await page.getByLabel("Minim").fill("500");
  await page.getByLabel("Maxim").fill("2000");
  await page.getByRole("button", { name: "Aplică filtrele" }).click();
  await expect(page).toHaveURL(/pret_min=500&pret_max=2000/);
  for (const p of await cardPrices(page)) {
    expect(p).toBeGreaterThanOrEqual(500);
    expect(p).toBeLessThanOrEqual(2000);
  }
  await expect(page.getByLabel("Minim")).toHaveValue("500");
  await page.getByRole("link", { name: "Șterge filtrele" }).click();
  await expect(page.getByLabel("Minim")).toHaveValue("");
});

test("brand and shop filters", async ({ page }) => {
  await page.goto("/ro/cautare");
  const total = await page.getByRole("status").first().innerText();
  const brandBoxes = page.getByRole("group", { name: "Mărci" }).getByRole("checkbox");
  expect(await brandBoxes.count()).toBeGreaterThan(1);
  await brandBoxes.first().check();
  await page.getByRole("button", { name: "Aplică filtrele" }).click();
  await expect(page).toHaveURL(/brand=\d+/);
  await expect(page.getByRole("status").first()).not.toHaveText(total);
  await expect(page.getByRole("group", { name: "Mărci" }).getByRole("checkbox").first()).toBeChecked();

  await page.getByRole("link", { name: "Șterge filtrele" }).click();
  const shopBoxes = page.getByRole("group", { name: "Magazine" }).getByRole("checkbox");
  expect(await shopBoxes.count()).toBe(3);
  await shopBoxes.first().check();
  await page.getByRole("button", { name: "Aplică filtrele" }).click();
  await expect(page).toHaveURL(/magazin=\d+/);
  // Shop + brand together, bogus ids ignored.
  const res = await page.goto("/ro/cautare?brand=abc&magazin=-1,99999999999999999999");
  expect(res?.status()).toBe(200);
  const res2 = await page.goto("/ro/cautare?brand=999999");
  expect(res2?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Nu am găsit produse" })).toBeVisible();
});

test("pagination: page 2, clamping, bad page numbers", async ({ page }) => {
  const total = (await rest<{ id: number }[]>("products?select=id&status=eq.active&offer_count=gt.0")).length;
  test.skip(total <= 24, "catalog has a single page");
  await page.goto("/ro/cautare");
  const nav = page.getByRole("navigation", { name: "Pagini" });
  await expect(nav).toBeVisible();
  await expect(page.locator("main ul li a[href*='/ro/p/']")).toHaveCount(24);
  await nav.getByRole("link", { name: "Înainte" }).click();
  await expect(page).toHaveURL(/pagina=2/);
  await expect(nav.locator("[aria-current=page]")).toHaveText("2");
  await expect(page.locator("main ul li a[href*='/ro/p/']")).toHaveCount(total - 24);
  await nav.getByRole("link", { name: "Înapoi" }).click();
  await expect(page).not.toHaveURL(/pagina=/);
  for (const bad of ["0", "-3", "abc", "99999", "1.5"]) {
    const res = await page.goto(`/ro/cautare?pagina=${bad}`);
    expect(res?.status(), bad).toBe(200);
  }
});

test("empty state and hostile query are escaped", async ({ page }) => {
  await page.goto("/ro/cautare?q=zzzqqqxx");
  await expect(page.getByRole("heading", { name: "Nu am găsit produse" })).toBeVisible();
  await expect(page.getByText("Încearcă alte cuvinte")).toBeVisible();
  await expect(page.getByRole("status").first()).toHaveText("Niciun produs");

  const xss = `<img src=x onerror=alert(1)>"'%`;
  const res = await page.goto(`/ro/cautare?q=${encodeURIComponent(xss)}`);
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("<img src=x");
  expect(await page.locator("img[src='x']").count()).toBe(0);

  // Very long query is truncated, SQL-ish characters are harmless.
  for (const q of ["a".repeat(500), "'; drop table products; --", "%_\\", "ă î ș ț â"]) {
    const r = await page.goto(`/ro/cautare?q=${encodeURIComponent(q)}`);
    expect(r?.status(), q.slice(0, 20)).toBe(200);
  }
  // Diacritics-insensitive search.
  await page.goto("/ro/cautare?q=masina+de+spalat");
  await expect(page.locator("main ul li a[href*='/ro/p/']").first()).toBeVisible();
});

test("category pages: root, leaf, breadcrumb, spec filters, unknown path", async ({ page }) => {
  await page.goto("/ro/c/telefoane-tablete");
  await expect(page.getByRole("heading", { level: 1, name: /Telefoane/ })).toBeVisible();
  const sub = page.getByRole("navigation", { name: "Subcategorii" });
  await expect(sub.getByRole("link", { name: /Telefoane mobile/ })).toBeVisible();
  await sub.getByRole("link", { name: /Telefoane mobile/ }).click();
  await expect(page).toHaveURL(/\/ro\/c\/telefoane-tablete\/telefoane-mobile$/);
  await expect(page.getByRole("navigation", { name: /Breadcrumb|Navigare|Traseu/i })).toBeVisible();

  // Spec filter (perfumes carry "Concentratie": 2 EDP of 7 women's perfumes).
  await page.goto("/ro/c/parfumuri/parfumuri-femei");
  const before = await page.getByRole("status").first().innerText();
  const group = page.getByRole("group", { name: "Concentratie" });
  await expect(group).toBeVisible();
  await group.getByRole("checkbox", { name: /EDP/ }).check();
  await page.getByRole("button", { name: "Aplică filtrele" }).click();
  await expect(page).toHaveURL(/spec_Concentratie=EDP/);
  await expect(page.getByRole("status").first()).toHaveText("2 produse");
  expect(before).not.toBe("2 produse");
  await expect(group.getByRole("checkbox", { name: /EDP/ })).toBeChecked();

  // Category listing price filter + sort stay on the category path.
  await page.goto("/ro/c/telefoane-tablete/telefoane-mobile?sort=price_asc&pret_max=2000");
  for (const p of await cardPrices(page)) expect(p).toBeLessThanOrEqual(2000);

  // Unknown spec key / value: no 500, empty result.
  const res = await page.goto("/ro/c/telefoane-tablete/telefoane-mobile?spec_Nimic=x");
  expect(res?.status()).toBe(200);

  // Unknown path -> 404 (covered in 03 too), also deep and encoded.
  for (const u of ["/ro/c/nu-exista", "/ro/c/telefoane-tablete/nu-exista", "/ro/c/a/b/c/d/e/f/g/h"]) {
    expect((await page.goto(u))?.status(), u).toBe(404);
  }
});

test("english listing uses RON and English labels", async ({ page }) => {
  await page.goto("/en/cautare?q=samsung&sort=price_asc");
  await expect(page.getByLabel("Sort")).toBeVisible();
  const txt = await page.locator("main ul li").first().innerText();
  expect(txt).toMatch(/RON\s?[\d,]+\.\d{2}/);
});

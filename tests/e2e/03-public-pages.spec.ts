import { a11yBasics, expect, noRawKeys, test } from "./helpers/fixtures";
import { rest } from "./helpers/api";

// Every public page in ro and en: status, one h1, labelled inputs, no raw i18n keys, no console errors / 5xx.
// Needs the DEV sample catalog (laptops, phones, TVs, washing machines, perfumes).

let productSlug = "";
let compareSlugs: string[] = [];
let merchantSlug = "";

test.beforeAll(async () => {
  const prods = await rest<{ slug: string }[]>(
    "products?select=slug&status=eq.active&offer_count=gte.2&order=offer_count.desc,id&limit=4",
  );
  productSlug = prods[0].slug;
  compareSlugs = prods.map((p) => p.slug);
  merchantSlug = (await rest<{ slug: string }[]>("merchants?select=slug&is_active=eq.true&order=id&limit=1"))[0].slug;
});

const STATIC = ["", "/cum-ordonam", "/despre-afiliere", "/confidentialitate", "/termeni", "/offline", "/autentificare"];

for (const loc of ["ro", "en"] as const) {
  test.describe(`pages ${loc}`, () => {
    test.use({ locale: loc === "ro" ? "ro-RO" : "en-GB" });

    for (const path of STATIC) {
      test(`static ${path || "/"}`, async ({ page }) => {
        const res = await page.goto(`/${loc}${path}`);
        expect(res?.status()).toBe(200);
        await expect(page.locator("html")).toHaveAttribute("lang", loc);
        await a11yBasics(page);
        await noRawKeys(page);
        await expect(page.getByRole("contentinfo")).toBeVisible();
      });
    }

    test("search, category, product, merchant, compare pages", async ({ page }) => {
      const urls = [
        `/${loc}/cautare`,
        `/${loc}/cautare?q=samsung`,
        `/${loc}/cautare?q=zzzqqqxx`,
        `/${loc}/c/telefoane-tablete`,
        `/${loc}/c/telefoane-tablete/telefoane-mobile`,
        `/${loc}/c/electrocasnice/electrocasnice-bucatarie/espressoare`,
        `/${loc}/p/${productSlug}`,
        `/${loc}/magazin/${merchantSlug}`,
        `/${loc}/comparare?p=${compareSlugs.join(",")}`,
        `/${loc}/comparare?p=${compareSlugs[0]}`,
        `/${loc}/comparare`,
      ];
      for (const u of urls) {
        const res = await page.goto(u);
        expect(res?.status(), u).toBe(200);
        await a11yBasics(page);
        await noRawKeys(page);
      }
    });

    test("404 pages", async ({ page }) => {
      for (const u of [
        `/${loc}/nu-exista`,
        `/${loc}/c/nu/exista`,
        `/${loc}/c/Telefoane%20X`,
        `/${loc}/p/nu-exista-deloc`,
        `/${loc}/p/UPPER__bad`,
        `/${loc}/magazin/nu-exista`,
      ]) {
        const res = await page.goto(u);
        expect(res?.status(), u).toBe(404);
        await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
        await noRawKeys(page);
      }
    });
  });
}

test("home: categories, price drops, header search", async ({ page }) => {
  await page.goto("/ro");
  await expect(page.getByRole("heading", { name: "Categorii", level: 2 })).toBeVisible();
  const cats = page.locator("section[aria-labelledby=cats-h] li a");
  expect(await cats.count()).toBeGreaterThanOrEqual(10);
  await cats.first().click();
  await expect(page).toHaveURL(/\/ro\/c\//);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // Header search: empty submit stays usable, query goes to /cautare.
  await page.goto("/ro");
  const box = page.getByRole("searchbox", { name: "Caută un produs" }).first();
  await box.fill("  iphone ");
  await box.press("Enter");
  await expect(page).toHaveURL(/\/ro\/cautare\?q=/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("iphone");
  await expect(page.locator("main ul li a[href*='/ro/p/']").first()).toBeVisible();
});

test("home price drops use lei and Omnibus wording", async ({ page }) => {
  await page.goto("/ro");
  const drops = page.locator("section[aria-labelledby=drops-h] li");
  if ((await drops.count()) === 0) test.skip(true, "no recent price drops on DEV");
  const txt = await drops.first().innerText();
  expect(txt).toMatch(/lei/);
  // A struck reference price must always come with the Omnibus 30-day statement.
  for (const li of await drops.all()) {
    if ((await li.locator("s").count()) > 0) await expect(li).toContainText(/Cel mai mic preț din ultimele/);
  }
});

test("technical routes: robots, sitemap, manifest, service worker, health", async ({ request }) => {
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toMatch(/Disallow: \//); // DEV is noindex

  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200); // empty on DEV (NOINDEX), but valid XML
  expect(await sitemap.text()).toMatch(/<urlset/);

  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.status()).toBe(200);
  const m = (await manifest.json()) as { name: string; icons: { src: string }[]; start_url: string };
  expect(m.name).toBe("Pretzuri");
  for (const icon of m.icons) expect((await request.get(icon.src)).status(), icon.src).toBe(200);

  const sw = await request.get("/serwist/sw.js");
  expect(sw.status()).toBe(200);
  expect(sw.headers()["content-type"]).toMatch(/javascript/);

  const health = await request.get("/api/health");
  expect(health.status()).toBe(200);
  expect(((await health.json()) as { ok: boolean }).ok).toBe(true);

  // noindex meta/header on DEV pages.
  const home = await request.get("/ro");
  const html = await home.text();
  expect(home.headers()["x-robots-tag"] ?? html).toMatch(/noindex/);
});

import { expect, test } from "./helpers/fixtures";

// Home -> search -> product -> /go redirect (302, not followed to the shop). Needs imported sample data on DEV.
test("home, search, product page and outbound click", async ({ page, request }) => {
  await page.goto("/ro");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Categorii", level: 2 })).toBeVisible();

  // Search with the header form (plain GET).
  const box = page.getByRole("searchbox", { name: "Caută un produs" }).first();
  await box.fill("samsung");
  await box.press("Enter");
  await expect(page).toHaveURL(/\/ro\/cautare\?q=samsung/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("samsung");

  const firstProduct = page.locator("main ul li a[href*='/ro/p/']").first();
  await expect(firstProduct).toBeVisible();
  await firstProduct.click();
  await expect(page).toHaveURL(/\/ro\/p\/[a-z0-9-]+$/);

  // Product page: offers in ranking order, JSON-LD, canonical.
  const offers = page.getByTestId("offer");
  await expect(offers.first()).toBeVisible();
  const ldTypes = await page
    .locator('script[type="application/ld+json"]')
    .evaluateAll((els) => els.map((e) => (JSON.parse(e.textContent ?? "{}") as { offers?: { "@type"?: string } }).offers?.["@type"]));
  expect(ldTypes).toContain("AggregateOffer");
  // Canonical + hreflang as crawlers get them (server HTML).
  const html = await (await request.get(page.url())).text();
  expect(html).toMatch(/<link rel="canonical" href="[^"]*\/ro\/p\/[a-z0-9-]+"/);
  expect(html).toMatch(/<link rel="alternate" hrefLang="en" href="[^"]*\/en\/p\//);

  const cta = offers.first().getByRole("link", { name: /Vezi oferta/ });
  const href = await cta.getAttribute("href");
  expect(href).toMatch(/^\/go\/\d+\?s=product$/);
  expect(await cta.getAttribute("rel")).toMatch(/nofollow noopener/);

  // /go: 302 to the shop, never cached, not indexed. Do not follow to the shop.
  const res = await request.get(href!, { maxRedirects: 0 });
  expect(res.status()).toBe(302);
  expect(res.headers()["location"]).toMatch(/^https?:\/\//);
  expect(res.headers()["cache-control"]).toContain("no-store");
  expect(res.headers()["x-robots-tag"]).toContain("noindex");

  const missing = await request.get("/go/999999999999", { maxRedirects: 0 });
  expect(missing.status()).toBe(404);
});

import { test as base, expect, type Page } from "@playwright/test";
import { API_URL, PUBLIC_API_URL } from "./env";

/**
 * Shared fixtures:
 * - `context` proxies the browser's Supabase calls (build-time public URL, which has no DNS inside the NAS test
 *   container) to the API gateway on the docker network.
 * - `problems` (auto) collects console errors, page errors and 5xx responses; every test must end with none.
 *   A test may push a regex into `ignoreProblems` for an expected one.
 */
type Fixtures = { problems: string[]; ignoreProblems: RegExp[] };

export const test = base.extend<Fixtures>({
  context: async ({ context }, provide) => {
    await context.route(`${PUBLIC_API_URL}/**`, async (route) => {
      const url = route.request().url().replace(PUBLIC_API_URL, API_URL);
      try {
        const response = await route.fetch({ url });
        await route.fulfill({ response });
      } catch {
        await route.abort();
      }
    });
    await provide(context);
  },
  ignoreProblems: async ({}, provide) => {
    await provide([]);
  },
  problems: [
    async ({ page, ignoreProblems }, provide) => {
      const list: string[] = [];
      const add = (s: string) => {
        if (!ignoreProblems.some((re) => re.test(s))) list.push(s);
      };
      page.on("pageerror", (e) => add(`pageerror: ${e.message}`));
      page.on("console", (m) => {
        // Failed resource loads are reported by the response listener below, with the URL.
        if (m.type() === "error" && !/Failed to load resource/.test(m.text())) add(`console: ${m.text()}`);
      });
      page.on("response", (r) => {
        if (r.status() >= 500) add(`${r.status()} ${r.request().method()} ${r.url()}`);
      });
      await provide(list);
      expect(list, "console errors / page errors / 5xx during the test").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** Exactly one h1, every visible form control has an accessible name. */
export async function a11yBasics(page: Page) {
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  const unlabeled = await page.evaluate(() => {
    const bad: string[] = [];
    document.querySelectorAll("input:not([type=hidden]):not([type=submit]), select, textarea").forEach((el) => {
      const e = el as HTMLInputElement;
      const named =
        e.getAttribute("aria-label") || e.getAttribute("aria-labelledby") || (e.labels && e.labels.length > 0) || e.title;
      if (!named) bad.push(`${e.tagName.toLowerCase()}[name=${e.name}]`);
    });
    return bad;
  });
  expect(unlabeled, "form controls without an accessible name").toEqual([]);
}

/** No raw next-intl key ("Listing.sort", "Account.title"...) rendered in the page text. */
export async function noRawKeys(page: Page) {
  const text = await page.locator("body").innerText();
  const hits = text.match(/\b[A-Z][A-Za-z]+(\.[a-zA-Z]+){1,3}\b/g) ?? [];
  expect(hits, "raw message keys visible").toEqual([]);
}

import { expect, test } from "./helpers/fixtures";
import { createUser, deleteUser, rest, type TestUser } from "./helpers/api";
import { signInWithCode } from "./helpers/ui";

// Merchant reviews: write (rating 1-5, body 20-4000), pre-moderation, edit -> back to pending, delete,
// DSA report. A dedicated merchant is created and removed here.

const RUN = Date.now().toString(36);
const users: TestUser[] = [];
let merchantId = 0;
let slug = "";

test.beforeAll(async () => {
  slug = `e2e-reviews-${RUN}`;
  const [m] = await rest<{ id: number }[]>("merchants", {
    method: "POST",
    json: { slug, name: `E2E Reviews Shop ${RUN}`, website: "https://shop.example" },
  });
  merchantId = m.id;
});

test.afterAll(async () => {
  for (const u of users) await deleteUser(u.id);
  await rest(`merchants?id=eq.${merchantId}`, { method: "DELETE" }).catch(() => undefined);
});

const reviewRows = (userId: string) =>
  rest<{ id: number; rating: number; title: string | null; body: string; status: string }[]>(
    `reviews?select=id,rating,title,body,status&merchant_id=eq.${merchantId}&user_id=eq.${userId}`,
  );

test("signed-out visitors see a sign-in link instead of the form", async ({ page }) => {
  await page.goto(`/ro/magazin/${slug}`);
  await expect(page.getByRole("link", { name: "Intră în cont ca să scrii o recenzie" })).toHaveAttribute("href", /autentificare/);
  await expect(page.getByText("Încă nu există recenzii publicate.")).toBeVisible();
});

test("write: validation boundaries, pending until moderated, edit, delete", async ({ page, browser }) => {
  const u = await createUser("rev");
  users.push(u);
  await signInWithCode(page, u.email);
  await page.goto(`/ro/magazin/${slug}`);
  const body = page.getByRole("textbox", { name: /^Recenzia/ });
  const submit = page.getByRole("button", { name: "Trimite recenzia" });

  // Body: 19 chars is refused by the browser, nothing stored; 4000 is the maximum typed.
  await body.fill("a".repeat(19));
  await submit.click();
  expect(await body.evaluate((el: HTMLTextAreaElement) => el.validity.tooShort)).toBe(true);
  expect(await reviewRows(u.id)).toHaveLength(0);
  await body.fill("b".repeat(4001));
  expect(await body.evaluate((el: HTMLTextAreaElement) => el.value.length)).toBeLessThanOrEqual(4001);
  expect(await body.evaluate((el: HTMLTextAreaElement) => el.validity.tooLong)).toBe(false); // programmatic fill is exempt

  // Whitespace padding does not count towards the 20 characters (server trims).
  await body.fill(`${" ".repeat(30)}${"c".repeat(10)}`);
  await page.getByRole("radio", { name: "1 din 5 stele" }).check({ force: true });
  await submit.click();
  await expect(page.getByText(/Verifică datele|Date invalide/).first()).toBeVisible();
  expect(await reviewRows(u.id)).toHaveLength(0);

  // Exactly 20 characters with rating 3 and a title.
  await page.getByLabel("Titlu (opțional)").fill("t".repeat(120));
  await page.getByRole("radio", { name: "3 din 5 stele" }).check({ force: true });
  await body.fill("d".repeat(20));
  await submit.click();
  await expect(page.getByText("În așteptarea moderării: va fi publicată după verificare.")).toBeVisible();
  let rows = await reviewRows(u.id);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ rating: 3, status: "pending", body: "d".repeat(20) });

  // Not public while pending.
  const anon = await browser.newContext();
  const anonPage = await anon.newPage();
  await anonPage.goto(`http://web:3000/ro/magazin/${slug}`);
  await expect(anonPage.getByText("Încă nu există recenzii publicate.")).toBeVisible();

  // Publish it (reviews_guard resets any non-admin UPDATE to pending, so the approved row is inserted directly;
  // the admin approve flow is covered in 10-admin-moderation).
  await rest(`reviews?id=eq.${rows[0].id}`, { method: "DELETE" });
  await rest("reviews", {
    method: "POST",
    json: { merchant_id: merchantId, user_id: u.id, rating: 5, title: "Super", body: "Magazin foarte bun, livrare rapidă.", status: "approved" },
  });
  await anonPage.reload();
  await expect(anonPage.getByText("Magazin foarte bun, livrare rapidă.")).toBeVisible();
  await expect(anonPage.getByRole("link", { name: "Intră în cont ca să raportezi" })).toBeVisible();
  await anon.close();

  await page.reload();
  await expect(page.getByText("Publicată.")).toBeVisible();
  await page.getByRole("button", { name: "Modifică" }).click();
  await page.getByRole("textbox", { name: /^Recenzia/ }).fill("Am modificat recenzia: acum are alt conținut.");
  await page.getByRole("radio", { name: "4 din 5 stele" }).check({ force: true });
  await page.getByRole("button", { name: "Trimite recenzia" }).click();
  await expect(page.getByText("În așteptarea moderării: va fi publicată după verificare.")).toBeVisible();
  rows = await reviewRows(u.id);
  expect(rows[0]).toMatchObject({ rating: 4, status: "pending", body: "Am modificat recenzia: acum are alt conținut." });

  // Delete (confirm dialog).
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Șterge", exact: true }).click();
  await expect.poll(async () => (await reviewRows(u.id)).length).toBe(0);
});

test("report a review (DSA notice): reason, details, stored once", async ({ page }) => {
  const author = await createUser("rev-author");
  const reporter = await createUser("rev-reporter");
  users.push(author, reporter);
  const [rev] = await rest<{ id: number }[]>("reviews", {
    method: "POST",
    json: { merchant_id: merchantId, user_id: author.id, rating: 2, body: "Recenzie de test pentru raportare, text suficient.", status: "approved" },
  });
  await signInWithCode(page, reporter.email);
  await page.goto(`/ro/magazin/${slug}`);
  await expect(page.getByText("Rating 2 din 5")).toBeVisible(); // approved review feeds the merchant rating
  await page.getByRole("button", { name: "Raportează" }).click();
  const reasons = await page.getByLabel("Motivul").locator("option").allInnerTexts();
  expect(reasons).toEqual(["Conținut ilegal", "Recenzie falsă", "Conținut jignitor", "Date personale", "Spam sau reclamă", "Alt motiv"]);
  await page.getByLabel("Motivul").selectOption("spam");
  await page.getByLabel("Detalii (opțional)").fill("Pare reclamă");
  await page.getByRole("button", { name: "Trimite raportarea" }).click();
  await expect(page.getByText("Ai raportat această recenzie. Îți mulțumim.")).toBeVisible();
  const reports = await rest<{ reason: string; details: string; status: string; reporter_id: string }[]>(
    `review_reports?select=reason,details,status,reporter_id&review_id=eq.${rev.id}`,
  );
  expect(reports).toEqual([{ reason: "spam", details: "Pare reclamă", status: "open", reporter_id: reporter.id }]);
  await page.reload();
  await expect(page.getByText("Ai raportat această recenzie. Îți mulțumim.")).toBeVisible(); // remembered
});

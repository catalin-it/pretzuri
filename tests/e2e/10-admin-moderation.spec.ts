import type { BrowserContext, Page } from "@playwright/test";
import { expect, test } from "./helpers/fixtures";
import { createUser, deleteUser, rest, type TestUser } from "./helpers/api";
import { adminPage, createAdminSession, proxiedContext, type AdminSession } from "./helpers/admin";
import { signInWithCode } from "./helpers/ui";

// Admin matching queue (merge / reject / split / manual merge) and review + DSA report moderation, all on
// DEDICATED fixture products and reviews (the sample catalog is never merged or split).

test.describe.configure({ mode: "serial" });

const RUN = Date.now().toString(36);
let admin: AdminSession;
let ctx: BrowserContext;
let page: Page;
let merchantId = 0;
const productIds: number[] = [];
const users: TestUser[] = [];

type Row = { id: number };

test.beforeAll(async ({ browser }) => {
  admin = await createAdminSession(browser);
  ({ context: ctx, page } = await adminPage(browser, admin));
  const [m] = await rest<Row[]>("merchants", {
    method: "POST",
    json: { slug: `e2e-mod-${RUN}`, name: `E2E Mod Shop ${RUN}`, website: "https://shop.example" },
  });
  merchantId = m.id;
});

test.afterAll(async () => {
  await ctx?.close();
  if (productIds.length) await rest(`products?id=in.(${productIds.join(",")})`, { method: "DELETE" }).catch(() => undefined);
  await rest(`merchants?id=eq.${merchantId}`, { method: "DELETE" }).catch(() => undefined);
  await deleteUser(admin?.user.id);
  for (const u of users) await deleteUser(u.id);
});

async function product(key: string, extra: Record<string, unknown> = {}) {
  const [p] = await rest<{ id: number; slug: string }[]>("products", {
    method: "POST",
    json: { slug: `e2e-match-${key.toLowerCase()}-${RUN}`, title: `E2E Match ${key} ${RUN}`, ...extra },
  });
  productIds.push(p.id);
  return p;
}
async function offer(productId: number, key: string, price = 100) {
  const [o] = await rest<Row[]>("offers", {
    method: "POST",
    json: { merchant_id: merchantId, product_id: productId, external_id: `${key}-${RUN}`, title: `E2E Offer ${key} ${RUN}`, url: `https://shop.example/${key}`, price },
  });
  return o.id;
}
async function queueItem(offerId: number, productId: number, candidateId: number) {
  const [q] = await rest<Row[]>("match_queue", {
    method: "POST",
    json: { offer_id: offerId, product_id: productId, reason: "title_review", candidates: [{ product_id: candidateId, score: 0.82 }] },
  });
  return q.id;
}
const item = (key: string) => page.locator("article").filter({ hasText: `E2E Offer ${key} ${RUN}` });

test("matching queue: merge keeps the candidate, moves offers, old slug redirects", async () => {
  const target = await product("MT");
  const source = await product("MS");
  await offer(target.id, "MT1", 110);
  const movedOffer = await offer(source.id, "MS1", 90);
  const q = await queueItem(movedOffer, source.id, target.id);

  await page.goto("/ro/admin/matching");
  await expect(item("MS1")).toContainText("titlu similar");
  await expect(item("MS1")).toContainText("scor 0,82");
  await item("MS1").getByRole("button", { name: "Unește cu acesta" }).click();
  await expect(page.getByRole("status")).toContainText("Produsele au fost unite.");
  await expect(item("MS1")).toHaveCount(0);

  const [src] = await rest<{ status: string; merged_into: number }[]>(`products?select=status,merged_into&id=eq.${source.id}`);
  expect(src).toMatchObject({ status: "merged", merged_into: target.id });
  const [o] = await rest<{ product_id: number; match_method: string }[]>(`offers?select=product_id,match_method&id=eq.${movedOffer}`);
  expect(o).toMatchObject({ product_id: target.id, match_method: "manual" });
  expect((await rest<{ offer_count: number }[]>(`products?select=offer_count&id=eq.${target.id}`))[0].offer_count).toBe(2);
  expect((await rest<{ status: string }[]>(`match_queue?select=status&id=eq.${q}`))[0].status).not.toBe("open");

  // The old public URL redirects (301) to the survivor; the survivor lists both offers.
  const res = await page.request.get(`/ro/p/${source.slug}`, { maxRedirects: 0 });
  expect(res.status()).toBe(308);
  expect(res.headers()["location"]).toContain(`/ro/p/${target.slug}`);
  await page.goto(`/ro/p/${source.slug}`);
  await expect(page).toHaveURL(new RegExp(`/ro/p/${target.slug}$`));
  await expect(page.getByTestId("offer")).toHaveCount(2);
});

test("matching queue: reject stores the pair as distinct and closes the item", async () => {
  const a = await product("RA");
  const b = await product("RB");
  await offer(a.id, "RA1");
  const ob = await offer(b.id, "RB1");
  const q = await queueItem(ob, b.id, a.id);
  await page.goto("/ro/admin/matching");
  await item("RB1").getByRole("button", { name: "Respinge (sunt produse diferite)" }).click();
  await expect(page.getByRole("status")).toContainText("Sugestia a fost respinsă");
  await expect(item("RB1")).toHaveCount(0);
  expect((await rest<{ status: string }[]>(`match_queue?select=status&id=eq.${q}`))[0].status).toBe("rejected");
  const lo = Math.min(a.id, b.id);
  const hi = Math.max(a.id, b.id);
  expect(await rest<unknown[]>(`product_distinct?select=*&product_a=eq.${lo}&product_b=eq.${hi}`)).toHaveLength(1);
  // Both products stay active and untouched.
  expect((await rest<{ status: string }[]>(`products?select=status&id=in.(${a.id},${b.id})`)).map((p) => p.status)).toEqual(["active", "active"]);
});

test("product page: split offers into a new product, refuse moving all, manual merge by slug", async () => {
  const p = await product("SP");
  const o1 = await offer(p.id, "SP1", 50);
  await offer(p.id, "SP2", 60);
  await page.goto(`/ro/admin/products/${p.id}`);
  await expect(page.getByRole("heading", { level: 2, name: /Oferte \(2\)/ })).toBeVisible();

  // Nothing selected -> refused / invalid, no change.
  await page.getByRole("button", { name: "Mută ofertele selectate într-un produs nou" }).click();
  await expect(page.locator("p[role=alert]")).toBeVisible();

  // All offers selected -> refused (the product must keep one).
  await page.getByRole("checkbox", { name: `E2E Offer SP1 ${RUN}` }).check();
  await page.getByRole("checkbox", { name: `E2E Offer SP2 ${RUN}` }).check();
  await page.getByRole("button", { name: "Mută ofertele selectate într-un produs nou" }).click();
  await expect(page.locator("p[role=alert]")).toContainText(/nu este permisă|Date invalide/);
  expect((await rest<unknown[]>(`offers?select=id&product_id=eq.${p.id}`)).length).toBe(2);

  // One offer with a custom title; a 1-character title is invalid.
  await page.getByRole("checkbox", { name: `E2E Offer SP1 ${RUN}` }).check();
  await page.getByLabel("Titlul produsului nou (opțional)").fill("x");
  await page.getByRole("button", { name: "Mută ofertele selectate într-un produs nou" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("Date invalide");
  // The form keeps its state after an error redirect: make the selection explicit.
  await page.getByRole("checkbox", { name: `E2E Offer SP1 ${RUN}` }).check();
  await page.getByRole("checkbox", { name: `E2E Offer SP2 ${RUN}` }).uncheck();
  await page.getByLabel("Titlul produsului nou (opțional)").fill(`E2E Split Result ${RUN}`);
  await page.getByRole("button", { name: "Mută ofertele selectate într-un produs nou" }).click();
  await expect(page.getByRole("status")).toContainText("Ofertele au fost mutate într-un produs nou.");
  const [moved] = await rest<{ product_id: number }[]>(`offers?select=product_id&id=eq.${o1}`);
  expect(moved.product_id).not.toBe(p.id);
  productIds.push(moved.product_id);
  const [np] = await rest<{ title: string; slug: string }[]>(`products?select=title,slug&id=eq.${moved.product_id}`);
  expect(np.title).toBe(`E2E Split Result ${RUN}`);
  expect((await rest<unknown[]>(`offers?select=id&product_id=eq.${p.id}`)).length).toBe(1);

  // Manual merge of the split product back by slug; unknown target refused; self refused.
  await page.goto(`/ro/admin/products/${moved.product_id}`);
  const mergeBox = page.getByPlaceholder("ID sau slug produs țintă");
  await mergeBox.fill("nu-exista-niciun-produs");
  await page.getByRole("button", { name: "Unește", exact: true }).click();
  await expect(page.locator("p[role=alert]")).toBeVisible();
  await mergeBox.fill(String(moved.product_id));
  await page.getByRole("button", { name: "Unește", exact: true }).click();
  await expect(page.locator("p[role=alert]")).toBeVisible();
  await mergeBox.fill(p.slug);
  await page.getByRole("button", { name: "Unește", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Produsele au fost unite.");
  expect((await rest<{ status: string; merged_into: number }[]>(`products?select=status,merged_into&id=eq.${moved.product_id}`))[0]).toMatchObject({
    status: "merged",
    merged_into: p.id,
  });
  expect((await rest<unknown[]>(`offers?select=id&product_id=eq.${p.id}`)).length).toBe(2);
  await page.goto(`/ro/admin/products/${moved.product_id}`);
  await expect(page.getByText(`Unit în produsul #${p.id}`)).toBeVisible();
});

test("review moderation: approve, reject needs a statement of reasons, author sees it", async ({ browser }) => {
  const author = await createUser("mod-author");
  users.push(author);
  const [r1] = await rest<Row[]>("reviews", {
    method: "POST",
    json: { merchant_id: merchantId, user_id: author.id, rating: 5, body: "Recenzie care va fi aprobată de moderator.", status: "pending" },
  });
  const author2 = await createUser("mod-author2");
  users.push(author2);
  const [r2] = await rest<Row[]>("reviews", {
    method: "POST",
    json: { merchant_id: merchantId, user_id: author2.id, rating: 1, body: "Recenzie care va fi respinsă de moderator.", status: "pending" },
  });

  await page.goto("/ro/admin/reviews");
  const card1 = page.locator("article, li").filter({ hasText: "Recenzie care va fi aprobată" }).last();
  await card1.getByRole("button", { name: "Aprobă" }).click();
  await expect(page.getByRole("status")).toContainText("Recenzia a fost aprobată.");
  expect((await rest<{ status: string }[]>(`reviews?select=status&id=eq.${r1.id}`))[0].status).toBe("approved");
  expect((await rest<{ rating_count: number }[]>(`merchants?select=rating_count&id=eq.${merchantId}`))[0].rating_count).toBe(1);

  const card2 = page.locator("article, li").filter({ hasText: "Recenzie care va fi respinsă" }).last();
  const form2 = card2.locator("form").filter({ has: page.getByRole("button", { name: "Respinge" }) });
  await form2.evaluate((f: HTMLFormElement) => {
    f.noValidate = true;
  });
  await form2.getByLabel(/Motivarea respingerii/).fill("scurt");
  await form2.getByRole("button", { name: "Respinge" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("Date invalide");
  expect((await rest<{ status: string }[]>(`reviews?select=status&id=eq.${r2.id}`))[0].status).toBe("pending");
  await page.locator("article, li").filter({ hasText: "Recenzie care va fi respinsă" }).last()
    .getByLabel(/Motivarea respingerii/).fill("Conține afirmații nedovedite despre magazin.");
  await page.locator("article, li").filter({ hasText: "Recenzie care va fi respinsă" }).last().getByRole("button", { name: "Respinge" }).click();
  await expect(page.getByRole("status")).toContainText("Recenzia a fost respinsă; motivarea a fost salvată.");
  const [rej] = await rest<{ status: string; moderation_reason: string }[]>(`reviews?select=status,moderation_reason&id=eq.${r2.id}`);
  expect(rej).toEqual({ status: "rejected", moderation_reason: "Conține afirmații nedovedite despre magazin." });

  // The author sees the status and the reason (DSA statement of reasons).
  const actx = await proxiedContext(browser);
  const ap = await actx.newPage();
  await signInWithCode(ap, author2.email);
  await ap.goto(`/ro/magazin/e2e-mod-${RUN}`);
  await expect(ap.getByText("Respinsă de moderatori.")).toBeVisible();
  await expect(ap.getByText("Motiv: Conține afirmații nedovedite despre magazin.")).toBeVisible();
  await actx.close();
});

test("DSA reports: dismiss and action (removing the review) both need reasons", async () => {
  const author = await createUser("rep-author");
  const reporter = await createUser("rep-reporter");
  const reporter2 = await createUser("rep-reporter2"); // one report per user and review
  users.push(author, reporter, reporter2);
  const [rev] = await rest<Row[]>("reviews", {
    method: "POST",
    json: { merchant_id: merchantId, user_id: author.id, rating: 2, body: "Recenzie publică ce va fi raportată de un utilizator.", status: "approved" },
  });
  const mkReport = async (reason: string, by = reporter) =>
    (await rest<Row[]>("review_reports", { method: "POST", json: { review_id: rev.id, reporter_id: by.id, reason, details: `detalii ${reason}` } }))[0].id;
  const rDismiss = await mkReport("spam");

  await page.goto("/ro/admin/reviews#reports");
  const box = () => page.locator("article, li").filter({ hasText: "detalii spam" }).last();
  await expect(box()).toContainText("spam");
  await box().locator("form").evaluate((f: HTMLFormElement) => {
    f.noValidate = true;
  });
  await box().getByLabel("Respinsă", { exact: true }).check();
  await box().getByLabel(/Motivarea deciziei/).fill("scurt");
  await box().getByRole("button", { name: "Salvează decizia" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("Date invalide");
  expect((await rest<{ status: string }[]>(`review_reports?select=status&id=eq.${rDismiss}`))[0].status).toBe("open");

  await box().getByLabel("Respinsă", { exact: true }).check();
  await box().getByLabel(/Motivarea deciziei/).fill("Recenzia respectă regulile comunității.");
  await box().getByRole("button", { name: "Salvează decizia" }).click();
  await expect(page.getByRole("status")).toContainText("Sesizarea a fost soluționată.");
  expect((await rest<{ status: string; decision_reason: string }[]>(`review_reports?select=status,decision_reason&id=eq.${rDismiss}`))[0]).toEqual({
    status: "dismissed",
    decision_reason: "Recenzia respectă regulile comunității.",
  });
  expect((await rest<{ status: string }[]>(`reviews?select=status&id=eq.${rev.id}`))[0].status).toBe("approved");

  // Second report, actioned + remove the review: removing is only valid with "actioned".
  const rAction = await mkReport("illegal", reporter2);
  await page.goto("/ro/admin/reviews#reports");
  const box2 = () => page.locator("article, li").filter({ hasText: "detalii illegal" }).last();
  await box2().locator("form").evaluate((f: HTMLFormElement) => {
    f.noValidate = true;
  });
  await box2().getByLabel("Respinsă", { exact: true }).check();
  await box2().getByLabel("Elimină recenzia").check();
  await box2().getByLabel(/Motivarea deciziei/).fill("Încercare de eliminare cu decizie greșită.");
  await box2().getByRole("button", { name: "Salvează decizia" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("Date invalide");
  expect((await rest<{ status: string }[]>(`reviews?select=status&id=eq.${rev.id}`))[0].status).toBe("approved");

  await box2().getByLabel("Întemeiată").check();
  await box2().getByLabel("Elimină recenzia").check();
  await box2().getByLabel(/Motivarea deciziei/).fill("Conținutul încalcă legea; recenzia a fost eliminată.");
  await box2().getByRole("button", { name: "Salvează decizia" }).click();
  await expect(page.getByRole("status")).toContainText("Sesizarea a fost soluționată.");
  expect((await rest<{ status: string }[]>(`reviews?select=status&id=eq.${rev.id}`))[0].status).toBe("removed");
  expect((await rest<{ status: string }[]>(`review_reports?select=status&id=eq.${rAction}`))[0].status).toBe("actioned");
  // Removed reviews are gone from the public page.
  const pub = await page.request.get(`/ro/magazin/e2e-mod-${RUN}`);
  expect(await pub.text()).not.toContain("Recenzie publică ce va fi raportată");
  // Decisions are logged.
  const log = await rest<{ action: string; reason: string | null }[]>(`moderation_log?select=action,reason&actor_id=eq.${admin.user.id}&order=id.desc&limit=10`);
  expect(log.some((l) => (l.reason ?? "").includes("eliminată"))).toBe(true);
});

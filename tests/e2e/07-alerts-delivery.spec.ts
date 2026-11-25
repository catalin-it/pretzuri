import { expect, test } from "./helpers/fixtures";
import { clearMail, createUser, deleteUser, mailCount, rest, rpc, waitMail, type TestUser } from "./helpers/api";

// Price alert delivery: evaluate + dispatch (run_price_alerts -> alert_outbox -> pg_net -> alerts-dispatch ->
// Mailpit), correct locale/price/link, no duplicate on a second run, re-notify only on a lower price.

const RUN = Date.now().toString(36);
const users: TestUser[] = [];
let merchantId = 0;
const productIds: number[] = [];

async function product(key: string, offer: Record<string, unknown>) {
  const [p] = await rest<{ id: number; slug: string }[]>("products", {
    method: "POST",
    json: { slug: `e2e-alert-${key}-${RUN}`, title: `E2E Alert ${key} ${RUN}` },
  });
  productIds.push(p.id);
  const [o] = await rest<{ id: number }[]>("offers", {
    method: "POST",
    json: {
      merchant_id: merchantId,
      product_id: p.id,
      external_id: `${key}-${RUN}`,
      title: `Offer ${key}`,
      url: `https://shop.example/${key}`,
      price: 100,
      shipping_cost: 0,
      availability: "in_stock",
      ...offer,
    },
  });
  return { ...p, offerId: o.id };
}

async function alertFor(u: TestUser, productId: number, target: number, extra: Record<string, unknown> = {}) {
  const [a] = await rest<{ id: number }[]>("price_alerts", {
    method: "POST",
    json: { user_id: u.id, product_id: productId, target_price: target, notify_email: true, ...extra },
  });
  return a.id;
}

async function runAlerts() {
  await rpc("run_price_alerts");
}

test.beforeAll(async () => {
  const [m] = await rest<{ id: number }[]>("merchants", {
    method: "POST",
    json: { slug: `e2e-alerts-${RUN}`, name: `E2E Alerts Shop ${RUN}`, website: "https://shop.example" },
  });
  merchantId = m.id;
});

test.afterAll(async () => {
  for (const u of users) await deleteUser(u.id);
  if (productIds.length) await rest(`products?id=in.(${productIds.join(",")})`, { method: "DELETE" }).catch(() => undefined);
  if (merchantId) await rest(`merchants?id=eq.${merchantId}`, { method: "DELETE" }).catch(() => undefined);
});

test("alert above the current price: one email (ro), none on rerun, again only on a lower price", async () => {
  test.setTimeout(180_000);
  const u = await createUser("alert-ro");
  users.push(u);
  await rest(`profiles?id=eq.${u.id}`, { method: "PATCH", json: { locale: "ro" } });
  const p = await product("ro", {});
  const alertId = await alertFor(u, p.id, 150);
  await clearMail(u.email);

  await runAlerts();
  const mail = await waitMail(u.email, { subject: /Alertă de preț/, timeoutMs: 90_000 });
  expect(mail.Subject).toBe(`Alertă de preț: ${`E2E Alert ro ${RUN}`} costă acum 100,00 lei`);
  expect(mail.Text).toContain("100,00 lei");
  expect(mail.Text).toContain("150,00 lei"); // the target
  expect(mail.Text).toContain(`/ro/p/${p.slug}`);
  expect(mail.Text).toContain("/ro/cont/alerte"); // unsubscribe / manage link
  expect(mail.HTML).toContain(`/ro/p/${p.slug}`);

  const sent = await rest<{ status: string; price: string }[]>(`alert_outbox?select=status,price&alert_id=eq.${alertId}`);
  expect(sent).toHaveLength(1);
  const [alert] = await rest<{ last_notified_price: string }[]>(`price_alerts?select=last_notified_price&id=eq.${alertId}`);
  expect(Number(alert.last_notified_price)).toBe(100);

  // Second run: no duplicate row, no duplicate mail.
  await runAlerts();
  await new Promise((r) => setTimeout(r, 8_000));
  expect(await rest<unknown[]>(`alert_outbox?select=id&alert_id=eq.${alertId}`)).toHaveLength(1);
  expect(await mailCount(u.email)).toBe(1);

  // Price drops below the last notified price: a new notification.
  await rest(`offers?id=eq.${p.offerId}`, { method: "PATCH", json: { price: 90 } });
  await runAlerts();
  await expect.poll(() => mailCount(u.email), { timeout: 90_000 }).toBe(2);
  expect(await rest<unknown[]>(`alert_outbox?select=id&alert_id=eq.${alertId}`)).toHaveLength(2);
});

test("english profile gets the English email; no mail when it must not fire", async () => {
  test.setTimeout(180_000);
  const en = await createUser("alert-en");
  users.push(en);
  await rest(`profiles?id=eq.${en.id}`, { method: "PATCH", json: { locale: "en" } });
  const off = await createUser("alert-off");
  users.push(off);
  await rest(`profiles?id=eq.${off.id}`, { method: "PATCH", json: { email_alerts: false } });

  const pEn = await product("en", { shipping_cost: 10 }); // total 110
  const pCheap = await product("below", {}); // total 100, target 50 -> must not fire
  const pOos = await product("oos", { availability: "out_of_stock" }); // never fires while out of stock
  const pOff = await product("off", {}); // fires but the user switched email alerts off
  await alertFor(en, pEn.id, 110); // boundary: price <= target fires
  await alertFor(en, pCheap.id, 50);
  await alertFor(en, pOos.id, 500);
  await alertFor(off, pOff.id, 500);
  await clearMail(en.email);
  await clearMail(off.email);

  await runAlerts();
  const mail = await waitMail(en.email, { subject: /Price alert/, timeoutMs: 90_000 });
  expect(mail.Subject).toBe(`Price alert: E2E Alert en ${RUN} is now 110.00 lei`);
  expect(mail.Text).toContain(`/en/p/${pEn.slug}`);
  await new Promise((r) => setTimeout(r, 8_000));
  expect(await mailCount(en.email)).toBe(1); // only the fired one
  expect(await mailCount(off.email)).toBe(0);
  const outbox = await rest<{ product_id: number }[]>(`alert_outbox?select=product_id&user_id=eq.${en.id}`);
  expect(outbox.map((o) => o.product_id)).toEqual([pEn.id]);
});

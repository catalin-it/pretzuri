// Pure helpers for alerts-dispatch (no Deno or npm imports): localized push/email texts and links.
// Unit-tested from tests/unit/alerts-dispatch-text.test.ts.

export type Locale = "ro" | "en";

export type AlertRow = {
  outbox_id: number;
  alert_id: number;
  locale: string | null;
  product_slug: string;
  product_title: string;
  merchant_name: string | null;
  price: number;
  target_price: number;
};

export function resolveLocale(raw: string | null | undefined): Locale {
  return raw === "en" ? "en" : "ro";
}

/** Lei with the ro-RO / en formats used by the web app (2 decimals, "lei"). */
export function formatLei(value: number, locale: Locale): string {
  const n = new Intl.NumberFormat(locale === "en" ? "en-GB" : "ro-RO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
  return `${n} lei`;
}

export function productPath(row: Pick<AlertRow, "product_slug">, locale: Locale): string {
  return `/${locale}/p/${encodeURIComponent(row.product_slug)}`;
}

export function alertsPath(row: Pick<AlertRow, "alert_id">, locale: Locale): string {
  return `/${locale}/cont/alerte?alert=${row.alert_id}`;
}

export function pushPayload(row: AlertRow): string {
  const l = resolveLocale(row.locale);
  const price = formatLei(row.price, l);
  const title = l === "en" ? "Price alert" : "Alertă de preț";
  const where = row.merchant_name ? (l === "en" ? ` at ${row.merchant_name}` : ` la ${row.merchant_name}`) : "";
  const body =
    l === "en"
      ? `${row.product_title}: now ${price}${where} (your target: ${formatLei(row.target_price, l)}).`
      : `${row.product_title}: acum ${price}${where} (ținta ta: ${formatLei(row.target_price, l)}).`;
  return JSON.stringify({ title, body, url: productPath(row, l), tag: `alert-${row.alert_id}` });
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function emailMessage(row: AlertRow, siteUrl: string): { subject: string; text: string; html: string; unsubscribeUrl: string } {
  const l = resolveLocale(row.locale);
  const base = siteUrl.replace(/\/$/, "");
  const productUrl = `${base}${productPath(row, l)}`;
  const unsubscribeUrl = `${base}${alertsPath(row, l)}`;
  const price = formatLei(row.price, l);
  const target = formatLei(row.target_price, l);
  const shop = row.merchant_name ?? "";
  const t =
    l === "en"
      ? {
          subject: `Price alert: ${row.product_title} is now ${price}`,
          intro: `Good news: the price of ${row.product_title} reached your target.`,
          now: `Lowest total price (incl. shipping): ${price}${shop ? ` at ${shop}` : ""}`,
          target: `Your target: ${target}`,
          cta: "See the offers",
          note: "Prices change often; check the offer in the shop before you buy.",
          manage: "Manage or turn off your price alerts",
        }
      : {
          subject: `Alertă de preț: ${row.product_title} costă acum ${price}`,
          intro: `Vești bune: prețul pentru ${row.product_title} a ajuns la ținta ta.`,
          now: `Cel mai mic preț total (cu livrare): ${price}${shop ? ` la ${shop}` : ""}`,
          target: `Ținta ta: ${target}`,
          cta: "Vezi ofertele",
          note: "Prețurile se schimbă des; verifică oferta în magazin înainte să cumperi.",
          manage: "Gestionează sau oprește alertele de preț",
        };
  const text = [t.intro, "", t.now, t.target, "", `${t.cta}: ${productUrl}`, "", t.note, "", `${t.manage}: ${unsubscribeUrl}`].join("\n");
  const e = escapeHtml;
  const html = `<!doctype html>
<html lang="${l}"><body style="margin:0;padding:24px;background:#f4f6f8;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#17202a">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;padding:28px">
<h1 style="margin:0 0 16px;font-size:24px;color:#0b6e4f">Pretzuri</h1>
<p>${e(t.intro)}</p>
<p style="font-size:18px;font-weight:700">${e(t.now)}</p>
<p>${e(t.target)}</p>
<p><a href="${e(productUrl)}" style="display:inline-block;background:#0b6e4f;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none">${e(t.cta)}</a></p>
<p style="font-size:13px;color:#5d6d7e">${e(t.note)}</p>
<p style="font-size:12px;color:#5d6d7e"><a href="${e(unsubscribeUrl)}">${e(t.manage)}</a></p>
</div></body></html>`;
  return { subject: t.subject, text, html, unsubscribeUrl };
}

const PUSH_HOST_SUFFIXES = ["fcm.googleapis.com", "push.services.mozilla.com", "notify.windows.com", "push.apple.com"];

/** SSRF guard: only POST to known browser push services. */
export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.port !== "" || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return PUSH_HOST_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`));
}

export function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  let diff = ab.length ^ bb.length;
  const n = Math.max(ab.length, bb.length);
  for (let i = 0; i < n; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

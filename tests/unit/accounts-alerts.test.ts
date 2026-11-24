import { describe, expect, it } from "vitest";
import { alertPrice, alertStatus, shouldNotify, suggestedTarget } from "@/lib/alerts/rules";
import {
  alertSchema,
  deletionConfirmed,
  emailSchema,
  otpSchema,
  parsePriceInput,
  passwordSchema,
  pushSubscriptionSchema,
  reportSchema,
  reviewSchema,
  safeNextPath,
} from "@/lib/account/schemas";
import { exportFileName, shapeExport, type ExportInput } from "@/lib/account/export";
import { rewriteOrigin } from "@/lib/supabase/env";
import { loginHref } from "@/lib/auth/links";
import {
  emailMessage,
  formatLei,
  isAllowedPushEndpoint,
  pushPayload,
  timingSafeEqual,
} from "../../supabase/functions/alerts-dispatch/text";

const NOW = new Date("2026-11-25T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

describe("alert decision rules", () => {
  const base = { isActive: true, targetPrice: 100, lastNotifiedAt: null, lastNotifiedPrice: null };

  it("uses the lowest total price of active, available offers", () => {
    expect(
      alertPrice([
        { totalPrice: 90, isActive: true, availability: "out_of_stock" },
        { totalPrice: 95, isActive: false, availability: "in_stock" },
        { totalPrice: 99, isActive: true, availability: "unknown" },
        { totalPrice: 120, isActive: true, availability: "in_stock" },
      ]),
    ).toBe(99);
    expect(alertPrice([{ totalPrice: 50, isActive: true, availability: "out_of_stock" }])).toBeNull();
  });

  it("fires when the price reaches the target, never when paused or above", () => {
    expect(shouldNotify(base, 100, NOW)).toBe(true);
    expect(shouldNotify(base, 80, NOW)).toBe(true);
    expect(shouldNotify(base, 100.01, NOW)).toBe(false);
    expect(shouldNotify(base, null, NOW)).toBe(false);
    expect(shouldNotify({ ...base, isActive: false }, 50, NOW)).toBe(false);
  });

  it("re-notifies only on a further drop or after 7 days", () => {
    const notified = { ...base, lastNotifiedAt: daysAgo(1), lastNotifiedPrice: 90 };
    expect(shouldNotify(notified, 90, NOW)).toBe(false);
    expect(shouldNotify(notified, 95, NOW)).toBe(false);
    expect(shouldNotify(notified, 89.99, NOW)).toBe(true);
    expect(shouldNotify({ ...notified, lastNotifiedAt: daysAgo(6.9) }, 90, NOW)).toBe(false);
    expect(shouldNotify({ ...notified, lastNotifiedAt: daysAgo(7.1) }, 95, NOW)).toBe(true);
  });

  it("status and suggested target", () => {
    expect(alertStatus(base, 120)).toBe("waiting");
    expect(alertStatus(base, 100)).toBe("reached");
    expect(alertStatus({ ...base, isActive: false }, 50)).toBe("paused");
    expect(suggestedTarget(1000)).toBe(950);
    expect(suggestedTarget(99.99)).toBe(94);
    expect(suggestedTarget(null)).toBeNull();
  });
});

describe("validation schemas", () => {
  it("email, code, password", () => {
    expect(emailSchema.parse("  Ana@Example.RO ")).toBe("ana@example.ro");
    expect(emailSchema.safeParse("nope").success).toBe(false);
    expect(otpSchema.safeParse("123456").success).toBe(true);
    expect(otpSchema.safeParse("12345").success).toBe(false);
    expect(otpSchema.safeParse("12345a").success).toBe(false);
    expect(passwordSchema.safeParse("short").success).toBe(false);
    expect(passwordSchema.safeParse("a long enough phrase").success).toBe(true);
    expect(passwordSchema.safeParse("ă".repeat(40)).success).toBe(false); // 80 bytes > bcrypt's 72
  });

  it("alert form: positive target, at least one channel, rounded to bani", () => {
    expect(alertSchema.parse({ productId: "7", targetPrice: "99.999", notifyPush: false, notifyEmail: true })).toEqual({
      productId: 7,
      targetPrice: 100,
      notifyPush: false,
      notifyEmail: true,
    });
    expect(alertSchema.safeParse({ productId: 7, targetPrice: 10, notifyPush: false, notifyEmail: false }).success).toBe(false);
    expect(alertSchema.safeParse({ productId: 7, targetPrice: 0, notifyPush: true, notifyEmail: false }).success).toBe(false);
    expect(alertSchema.safeParse({ productId: -1, targetPrice: 5, notifyPush: true, notifyEmail: false }).success).toBe(false);
  });

  it("price input accepts the Romanian decimal comma", () => {
    expect(parsePriceInput("1.299,5")).toBeNull();
    expect(parsePriceInput("1299,50")).toBe(1299.5);
    expect(parsePriceInput("1299.5 lei")).toBe(1299.5);
    expect(parsePriceInput("0")).toBeNull();
    expect(parsePriceInput("-5")).toBeNull();
    expect(parsePriceInput("abc")).toBeNull();
  });

  it("push subscription must be https", () => {
    const keys = { p256dh: "x".repeat(87), auth: "y".repeat(22) };
    expect(pushSubscriptionSchema.safeParse({ endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys }).success).toBe(true);
    expect(pushSubscriptionSchema.safeParse({ endpoint: "http://evil.test/x", keys }).success).toBe(false);
  });

  it("review and report", () => {
    expect(reviewSchema.safeParse({ merchantId: 1, rating: 5, title: "", body: "short" }).success).toBe(false);
    const ok = reviewSchema.parse({ merchantId: 1, rating: 4, title: "  ", body: "A long enough review body text." });
    expect(ok.title).toBeNull();
    expect(reviewSchema.safeParse({ merchantId: 1, rating: 6, title: "", body: "x".repeat(30) }).success).toBe(false);
    expect(reportSchema.safeParse({ reviewId: 3, reason: "fake", details: "" }).success).toBe(true);
    expect(reportSchema.safeParse({ reviewId: 3, reason: "boring", details: "" }).success).toBe(false);
  });

  it("safe redirect after sign-in", () => {
    expect(safeNextPath("/ro/p/telefon-x", "ro")).toBe("/ro/p/telefon-x");
    expect(safeNextPath("/en/cont/alerte?alert=3", "en")).toBe("/en/cont/alerte?alert=3");
    expect(safeNextPath("//evil.test", "ro")).toBe("/ro/cont");
    expect(safeNextPath("https://evil.test", "ro")).toBe("/ro/cont");
    expect(safeNextPath("/ro\\evil", "ro")).toBe("/ro/cont");
    expect(safeNextPath("/admin", "en")).toBe("/en/cont");
    expect(safeNextPath(undefined, "en")).toBe("/en/cont");
    expect(loginHref("/en/p/x")).toBe("/en/autentificare?next=%2Fen%2Fp%2Fx");
  });

  it("deletion needs the account email", () => {
    expect(deletionConfirmed(" ANA@example.ro ", "ana@example.ro")).toBe(true);
    expect(deletionConfirmed("ana@example.r", "ana@example.ro")).toBe(false);
    expect(deletionConfirmed("", null)).toBe(false);
  });
});

describe("GDPR export shaping", () => {
  const input: ExportInput = {
    user: { id: "u1", email: "ana@example.ro", created_at: "2026-11-01T00:00:00Z" },
    profile: { display_name: "Ana", locale: "ro", email_alerts: true, created_at: "x", updated_at: "y" },
    favorites: [{ created_at: "2026-11-02T00:00:00Z", product: [{ slug: "p1", title: "Produs 1" }] }],
    alerts: [
      {
        target_price: "99.90",
        notify_push: true,
        notify_email: false,
        is_active: true,
        last_notified_at: null,
        last_notified_price: null,
        created_at: "c",
        updated_at: "u",
        product: { slug: "p1", title: "Produs 1" },
      },
    ],
    history: [{ viewed_at: "v", product: null }],
    reviews: [
      {
        rating: 5,
        title: null,
        body: "Foarte bine",
        status: "pending",
        moderation_reason: null,
        created_at: "c",
        updated_at: "u",
        merchant: { slug: "m1", name: "Magazin" },
      },
    ],
    reports: [],
    pushSubscriptions: [{ endpoint: "https://fcm.googleapis.com/fcm/send/SECRET-TOKEN", created_at: "c", last_used_at: null }],
  };

  it("contains every category, numbers as numbers, no push keys or endpoint tokens", () => {
    const out = shapeExport(input, NOW);
    expect(out.format_version).toBe(1);
    expect(out.generated_at).toBe(NOW.toISOString());
    expect(out.account.email).toBe("ana@example.ro");
    expect(out.favorites[0].product).toEqual({ slug: "p1", title: "Produs 1" });
    expect(out.price_alerts[0].target_price).toBe(99.9);
    expect(out.view_history[0].product).toBeNull();
    expect(out.reviews[0].merchant).toEqual({ slug: "m1", name: "Magazin" });
    expect(out.push_subscriptions[0].push_service).toBe("https://fcm.googleapis.com");
    expect(JSON.stringify(out)).not.toContain("SECRET-TOKEN");
    expect(exportFileName(NOW)).toBe("pretzuri-export-2026-11-25.json");
  });
});

describe("server auth fetch", () => {
  it("rewrites only the public Supabase origin", () => {
    const from = "https://api-dev-pretzuri.it-ist.ro";
    expect(rewriteOrigin(`${from}/auth/v1/user`, from, "http://api-gw:8000")).toBe("http://api-gw:8000/auth/v1/user");
    expect(rewriteOrigin(`${from}.evil.test/x`, from, "http://api-gw:8000")).toBe(`${from}.evil.test/x`);
    expect(rewriteOrigin("https://other.test/a", from, "http://api-gw:8000")).toBe("https://other.test/a");
  });
});

describe("alerts-dispatch texts", () => {
  const row = {
    outbox_id: 1,
    alert_id: 42,
    locale: "ro",
    product_slug: "telefon-x",
    product_title: "Telefon <X>",
    merchant_name: "Magazin",
    price: 1299.5,
    target_price: 1300,
  };

  it("push payload: localized, relative product URL, per-alert tag", () => {
    const p = JSON.parse(pushPayload(row));
    expect(p.title).toBe("Alertă de preț");
    expect(p.url).toBe("/ro/p/telefon-x");
    expect(p.tag).toBe("alert-42");
    expect(p.body).toContain(formatLei(1299.5, "ro"));
    expect(JSON.parse(pushPayload({ ...row, locale: "en" })).title).toBe("Price alert");
  });

  it("email: product link, manage/unsubscribe link, escaped HTML", () => {
    const m = emailMessage({ ...row, locale: "en" }, "https://dev-pretzuri.it-ist.ro/");
    expect(m.subject).toContain("Telefon <X>");
    expect(m.text).toContain("https://dev-pretzuri.it-ist.ro/en/p/telefon-x");
    expect(m.unsubscribeUrl).toBe("https://dev-pretzuri.it-ist.ro/en/cont/alerte?alert=42");
    expect(m.html).toContain("Telefon &lt;X&gt;");
    expect(m.html).not.toContain("Telefon <X>");
    expect(emailMessage(row, "https://x.test").subject).toMatch(/^Alertă de preț/);
  });

  it("guards", () => {
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com/fcm/send/a")).toBe(true);
    expect(isAllowedPushEndpoint("https://web.push.apple.com/abc")).toBe(true);
    expect(isAllowedPushEndpoint("https://evil.test/fcm.googleapis.com")).toBe(false);
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com:8443/x")).toBe(false);
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
  });
});

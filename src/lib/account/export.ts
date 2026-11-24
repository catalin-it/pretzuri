/**
 * GDPR data export (Art. 15/20): the user's own rows, read with their session (RLS), shaped into one JSON document.
 * Push subscriptions are exported without keys and with the endpoint reduced to its origin (the full endpoint is a
 * bearer capability for sending pushes).
 */
export const EXPORT_FORMAT_VERSION = 1;

type Product = { slug: string; title: string } | { slug: string; title: string }[] | null;
type Merchant = { slug: string; name: string } | { slug: string; name: string }[] | null;

export type ExportInput = {
  user: { id: string; email: string | null; created_at?: string | null };
  profile: { display_name: string | null; locale: string; email_alerts: boolean; created_at: string; updated_at: string } | null;
  favorites: { created_at: string; product: Product }[];
  alerts: {
    target_price: number | string;
    notify_push: boolean;
    notify_email: boolean;
    is_active: boolean;
    last_notified_at: string | null;
    last_notified_price: number | string | null;
    created_at: string;
    updated_at: string;
    product: Product;
  }[];
  history: { viewed_at: string; product: Product }[];
  reviews: {
    rating: number;
    title: string | null;
    body: string;
    status: string;
    moderation_reason: string | null;
    created_at: string;
    updated_at: string;
    merchant: Merchant;
  }[];
  reports: { reason: string; details: string | null; status: string; created_at: string }[];
  pushSubscriptions: { endpoint: string; created_at: string; last_used_at: string | null }[];
};

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

const num = (v: number | string | null) => (v === null ? null : Number(v));

function originOnly(endpoint: string): string {
  try {
    return new URL(endpoint).origin;
  } catch {
    return "";
  }
}

export function shapeExport(input: ExportInput, generatedAt: Date = new Date()) {
  const product = (p: Product) => {
    const x = one(p);
    return x ? { slug: x.slug, title: x.title } : null;
  };
  return {
    format_version: EXPORT_FORMAT_VERSION,
    generated_at: generatedAt.toISOString(),
    service: "Pretzuri",
    account: { id: input.user.id, email: input.user.email, created_at: input.user.created_at ?? null },
    profile: input.profile,
    favorites: input.favorites.map((f) => ({ product: product(f.product), created_at: f.created_at })),
    price_alerts: input.alerts.map((a) => ({
      product: product(a.product),
      target_price: num(a.target_price),
      currency: "RON",
      notify_push: a.notify_push,
      notify_email: a.notify_email,
      is_active: a.is_active,
      last_notified_at: a.last_notified_at,
      last_notified_price: num(a.last_notified_price),
      created_at: a.created_at,
      updated_at: a.updated_at,
    })),
    view_history: input.history.map((h) => ({ product: product(h.product), viewed_at: h.viewed_at })),
    reviews: input.reviews.map((r) => {
      const m = one(r.merchant);
      return {
        merchant: m ? { slug: m.slug, name: m.name } : null,
        rating: r.rating,
        title: r.title,
        body: r.body,
        status: r.status,
        moderation_reason: r.moderation_reason,
        created_at: r.created_at,
        updated_at: r.updated_at,
      };
    }),
    review_reports: input.reports.map((r) => ({ reason: r.reason, details: r.details, status: r.status, created_at: r.created_at })),
    push_subscriptions: input.pushSubscriptions.map((s) => ({
      push_service: originOnly(s.endpoint),
      created_at: s.created_at,
      last_used_at: s.last_used_at,
    })),
  };
}

export function exportFileName(now: Date = new Date()): string {
  return `pretzuri-export-${now.toISOString().slice(0, 10)}.json`;
}

import { getTranslations } from "next-intl/server";
import { isFlashCode } from "@/lib/admin/feedback";

/** Shared classes for admin forms and tables (design tokens from globals.css). */
export const cls = {
  input: "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm",
  label: "flex flex-col gap-1 text-sm font-medium",
  check: "flex items-center gap-2 text-sm",
  btn: "rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-contrast hover:bg-accent-hover",
  btnSecondary: "rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-surface",
  btnDanger: "rounded-lg border border-price-drop px-3 py-2 text-sm font-semibold text-price-drop hover:bg-surface",
  card: "rounded-xl border border-border-subtle bg-surface-raised p-4",
  table: "w-full border-collapse text-left text-sm",
  th: "border-b border-border-subtle px-2 py-2 font-semibold text-muted",
  td: "border-b border-border-subtle px-2 py-2 align-top",
  h1: "text-2xl font-bold",
  h2: "text-lg font-semibold",
  muted: "text-sm text-muted",
};

/** Hidden fields every admin form sends: locale and the path to return to (validated server-side). */
export function FormContext({ locale, back }: { locale: string; back: string }) {
  return (
    <>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="back" value={back} />
    </>
  );
}

/** Result banner of the last action (`?ok=` / `?err=` codes set by the server actions). */
export async function Flash({ ok, err }: { ok?: string | string[]; err?: string | string[] }) {
  const t = await getTranslations("Admin.flash");
  const code = typeof err === "string" ? err : typeof ok === "string" ? ok : null;
  if (!code || !isFlashCode(code)) return null;
  const isErr = typeof err === "string";
  return (
    <p
      role={isErr ? "alert" : "status"}
      className={`rounded-lg border px-3 py-2 text-sm ${isErr ? "border-price-drop text-price-drop" : "border-accent text-accent-text"}`}
    >
      {t(code)}
    </p>
  );
}

export function Stat({ label, value, href }: { label: string; value: number | string; href?: string }) {
  const body = (
    <>
      <span className="text-2xl font-bold">{value}</span>
      <span className="text-sm text-muted">{label}</span>
    </>
  );
  return href ? (
    <a href={href} className={`${cls.card} flex flex-col gap-1 hover:border-border`}>
      {body}
    </a>
  ) : (
    <div className={`${cls.card} flex flex-col gap-1`}>{body}</div>
  );
}

/** Status pill for feed runs and moderation states. */
export function Pill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "ok" | "warn" | "bad" | "neutral" }) {
  const tones = {
    ok: "border-accent text-accent-text",
    warn: "border-promoted text-promoted",
    bad: "border-price-drop text-price-drop",
    neutral: "border-border text-muted",
  } as const;
  return <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}

export function runTone(status: string): "ok" | "warn" | "bad" | "neutral" {
  if (status === "ok" || status === "not_modified") return "ok";
  if (status === "partial" || status === "running") return "warn";
  if (status === "failed") return "bad";
  return "neutral";
}

/** Simple previous/next pager over `?page=`. */
export function Pager({
  base,
  page,
  hasNext,
  labels,
  params = {},
}: {
  base: string;
  page: number;
  hasNext: boolean;
  labels: { prev: string; next: string; nav: string };
  params?: Record<string, string>;
}) {
  const href = (p: number) => {
    const q = new URLSearchParams({ ...params, page: String(p) });
    return `${base}?${q.toString()}`;
  };
  if (page <= 1 && !hasNext) return null;
  return (
    <nav className="flex gap-3 text-sm" aria-label={labels.nav}>
      {page > 1 ? (
        <a className="underline" href={href(page - 1)}>
          {labels.prev}
        </a>
      ) : null}
      {hasNext ? (
        <a className="underline" href={href(page + 1)}>
          {labels.next}
        </a>
      ) : null}
    </nav>
  );
}

export function pageParam(v: string | string[] | undefined): number {
  const n = typeof v === "string" ? Number(v) : 1;
  return Number.isInteger(n) && n > 0 && n < 10_000 ? n : 1;
}

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

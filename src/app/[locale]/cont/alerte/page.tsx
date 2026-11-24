import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { AlertRowActions } from "@/components/account/account-actions";
import { getAlerts, getProfile } from "@/lib/account/queries";
import { alertStatus } from "@/lib/alerts/rules";
import { requireUser } from "@/lib/auth/session";
import { formatDate, formatPrice } from "@/lib/format";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ alert?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Alerts" });
  return { title: t("title") };
}

export default async function AlertsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireUser(locale, "/cont/alerte");
  const { alert: highlight } = await searchParams;
  const [t, alerts, profile] = await Promise.all([getTranslations("Alerts"), getAlerts(), getProfile()]);
  const loc = locale as Locale;
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="max-w-prose text-sm text-muted">{t("intro")}</p>
      {profile && !profile.email_alerts ? (
        <p className="text-sm" role="status">
          {t("emailOff")}{" "}
          <Link href="/cont" className="underline">
            {t("emailOffLink")}
          </Link>
        </p>
      ) : null}
      {alerts.length === 0 ? (
        <p className="text-muted">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {alerts.map((a) => {
            const current = a.product.min_price === null ? null : Number(a.product.min_price);
            const status = alertStatus(
              { isActive: a.is_active, targetPrice: a.target_price, lastNotifiedAt: a.last_notified_at, lastNotifiedPrice: a.last_notified_price },
              current,
            );
            const channels = [a.notify_email ? t("channelEmail") : null, a.notify_push ? t("channelPush") : null].filter(Boolean).join(", ");
            return (
              <li
                key={a.id}
                id={`alert-${a.id}`}
                className={`flex flex-col gap-2 rounded-xl border p-4 ${String(a.id) === highlight ? "border-accent" : "border-border-subtle"}`}
              >
                <Link href={`/p/${a.product.slug}`} className="font-semibold hover:underline">
                  {a.product.title}
                </Link>
                <p className="text-sm">
                  {t("target", { price: formatPrice(a.target_price, loc) })}
                  {current !== null ? ` · ${t("current", { price: formatPrice(current, loc) })}` : ""}
                </p>
                <p className="text-sm text-muted">
                  {t(`status_${status}`)} · {channels}
                  {a.last_notified_at ? ` · ${t("lastNotified", { date: formatDate(a.last_notified_at, loc) })}` : ""}
                </p>
                <AlertRowActions alertId={a.id} active={a.is_active} title={a.product.title} />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

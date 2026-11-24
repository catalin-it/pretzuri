import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { ClearHistoryButton } from "@/components/account/account-actions";
import { getHistory } from "@/lib/account/queries";
import { requireUser } from "@/lib/auth/session";
import { formatDate, formatPrice } from "@/lib/format";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Account" });
  return { title: t("historyTitle") };
}

export default async function HistoryPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireUser(locale, "/cont/istoric");
  const [t, items] = await Promise.all([getTranslations("Account"), getHistory()]);
  const loc = locale as Locale;
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{t("historyTitle")}</h1>
      <p className="max-w-prose text-sm text-muted">{t("historyIntro")}</p>
      {items.length === 0 ? (
        <p className="text-muted">{t("historyEmpty")}</p>
      ) : (
        <>
          <ClearHistoryButton />
          <ul className="flex flex-col divide-y divide-border-subtle">
            {items.map(({ product: p, viewed_at }) => (
              <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <Link href={`/p/${p.slug}`} className="font-medium hover:underline">
                  {p.title}
                </Link>
                <span className="text-sm text-muted">
                  {p.min_price !== null ? `${formatPrice(Number(p.min_price), loc)} · ` : ""}
                  {formatDate(viewed_at, loc)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

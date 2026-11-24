import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { formatDate, formatPrice } from "@/lib/format";
import { type DailyPoint, changePoints, chartGeometry } from "@/lib/product/price-chart";

const W = 640;
const H = 180;

/** Lowest price per day (all shops) as an inline SVG step line, with a text summary and a data table. */
export async function PriceHistory({ series }: { series: DailyPoint[] }) {
  const [t, locale] = await Promise.all([getTranslations("PriceHistory"), getLocale() as Promise<Locale>]);
  const geo = chartGeometry(series, W, H);
  if (!geo) return <p className="text-muted">{t("empty")}</p>;
  const first = series[0];
  const last = series[series.length - 1];
  const changes = changePoints(series);
  const summary = t("summary", {
    from: formatDate(first.date, locale),
    to: formatDate(last.date, locale),
    low: formatPrice(geo.low, locale),
    high: formatPrice(geo.high, locale),
    current: formatPrice(last.min, locale),
  });
  return (
    <figure className="flex flex-col gap-2">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={summary}
        className="h-auto w-full rounded-lg border border-border-subtle bg-surface"
        preserveAspectRatio="none"
      >
        <line x1="8" x2={W - 8} y1="8" y2="8" stroke="currentColor" strokeOpacity="0.15" />
        <line x1="8" x2={W - 8} y1={H - 8} y2={H - 8} stroke="currentColor" strokeOpacity="0.15" />
        <path d={geo.path} fill="none" stroke="var(--accent)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
        <circle cx={geo.points[geo.points.length - 1].x} cy={geo.points[geo.points.length - 1].y} r="4" fill="var(--accent)" />
      </svg>
      <figcaption className="flex flex-wrap justify-between gap-2 text-sm text-muted">
        <span>{t("legend")}</span>
        <span>
          {t("max", { price: formatPrice(geo.high, locale) })} · {t("min", { price: formatPrice(geo.low, locale) })}
        </span>
      </figcaption>
      <p className="text-sm">{summary}</p>
      <details className="text-sm">
        <summary className="cursor-pointer underline">{t("tableToggle")}</summary>
        <table className="mt-2 w-full max-w-md text-left">
          <caption className="sr-only">{t("tableCaption")}</caption>
          <thead>
            <tr>
              <th scope="col" className="py-1 pr-4">{t("date")}</th>
              <th scope="col" className="py-1">{t("lowestPrice")}</th>
            </tr>
          </thead>
          <tbody>
            {changes.map((p) => (
              <tr key={p.date} className="border-t border-border-subtle">
                <td className="py-1 pr-4">{formatDate(p.date, locale)}</td>
                <td className="py-1">{formatPrice(p.min, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

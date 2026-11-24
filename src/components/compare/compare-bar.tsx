"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { COMPARE_MAX } from "@/lib/compare/slugs";
import { clearCompare, useCompareList } from "./compare-store";

/** Sticky bar shown while products are selected for comparison. */
export function CompareBar() {
  const t = useTranslations("Compare");
  const list = useCompareList();
  if (list.length === 0) return null;
  const ready = list.length >= 2;
  return (
    <div
      role="region"
      aria-label={t("barLabel")}
      className="sticky bottom-0 z-20 border-t border-border-subtle bg-surface-raised/95 backdrop-blur"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 text-sm">
        <span className="font-semibold">{t("selected", { count: list.length, max: COMPARE_MAX })}</span>
        {ready ? (
          <Link
            href={`/comparare?p=${list.join(",")}`}
            className="rounded-lg bg-accent px-4 py-2 font-semibold text-accent-contrast hover:bg-accent-hover"
          >
            {t("go")}
          </Link>
        ) : (
          <span className="text-muted">{t("needTwo")}</span>
        )}
        <button type="button" onClick={clearCompare} className="underline">
          {t("clear")}
        </button>
      </div>
    </div>
  );
}

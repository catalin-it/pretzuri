"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { COMPARE_MAX } from "@/lib/compare/slugs";
import { toggleCompareSlug, useCompareList } from "./compare-store";

/** "Add to compare" toggle on listing cards (needs JS; without it the button is simply not shown). */
export function CompareToggle({ slug, title }: { slug: string; title: string }) {
  const t = useTranslations("Compare");
  const list = useCompareList();
  const [full, setFull] = useState(false);
  const selected = list.includes(slug);
  return (
    <div className="flex flex-col gap-1">
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => setFull(!toggleCompareSlug(slug))}
          aria-label={t("toggleLabel", { title })}
          className="h-4 w-4 accent-accent"
        />
        {t("toggle")}
      </label>
      {full && !selected ? (
        <span role="status" className="text-xs text-price-drop">
          {t("full", { max: COMPARE_MAX })}
        </span>
      ) : null}
    </div>
  );
}

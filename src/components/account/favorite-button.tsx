"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { setFavorite } from "@/lib/account/actions";
import { loginHref } from "@/lib/auth/links";

/**
 * Favorite toggle (optimistic). `signedIn=false` renders a link to the sign-in page that returns to `returnTo`.
 * `compact` is the small variant for listing cards.
 */
export function FavoriteButton({
  productId,
  title,
  initial,
  signedIn,
  returnTo,
  compact = false,
  refresh = false,
}: {
  productId: number;
  title: string;
  initial: boolean;
  signedIn: boolean;
  returnTo: string;
  compact?: boolean;
  /** Re-render the page after a change (account favorites list). */
  refresh?: boolean;
}) {
  const t = useTranslations("Favorites");
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();
  const cls = compact
    ? "w-fit text-sm underline-offset-2 hover:underline"
    : "rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface";

  if (!signedIn) {
    return (
      <a href={loginHref(returnTo)} className={cls}>
        {compact ? `☆ ${t("add")}` : t("add")}
      </a>
    );
  }
  return (
    <span className="flex flex-col gap-1">
      <button
        type="button"
        aria-pressed={on}
        aria-label={on ? t("removeLabel", { title }) : t("addLabel", { title })}
        disabled={pending}
        className={cls}
        onClick={() => {
          const next = !on;
          setOn(next);
          setFailed(false);
          start(async () => {
            const r = await setFavorite({ productId, on: next });
            if (!r.ok) {
              setOn(!next);
              setFailed(true);
            } else if (refresh) router.refresh();
          });
        }}
      >
        {on ? `★ ${t("remove")}` : `☆ ${t("add")}`}
      </button>
      {failed ? (
        <span role="alert" className="text-xs text-price-drop">
          {t("error")}
        </span>
      ) : null}
    </span>
  );
}


"use client";

import { useTranslations } from "next-intl";
import type { ActionError } from "@/lib/account/actions";

export const BTN =
  "rounded-lg bg-accent px-4 py-2 font-semibold text-accent-contrast hover:bg-accent-hover disabled:opacity-60";
export const BTN_SECONDARY = "rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface disabled:opacity-60";
export const INPUT = "w-full rounded-lg border border-border bg-surface-raised px-3 py-2";

/** Localized error line for an action error code (Auth.errors.*). */
export function ErrorText({ error }: { error: ActionError | null }) {
  const t = useTranslations("Auth.errors");
  if (!error) return null;
  return (
    <p role="alert" className="text-sm text-price-drop">
      {t(error)}
    </p>
  );
}

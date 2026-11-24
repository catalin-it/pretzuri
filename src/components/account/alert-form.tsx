"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { type ActionError, deleteAlert, saveAlert, savePushSubscription } from "@/lib/account/actions";
import { parsePriceInput } from "@/lib/account/schemas";
import { formatPrice } from "@/lib/format";
import { setupPush } from "@/lib/pwa/push-subscribe";
import { BTN, BTN_SECONDARY, ErrorText, INPUT } from "./ui";

export type AlertInitial = {
  id: number;
  target_price: number;
  notify_push: boolean;
  notify_email: boolean;
  is_active: boolean;
} | null;

/** Create / edit / delete the price alert of one product (product page). */
export function AlertForm({
  productId,
  currentPrice,
  suggested,
  initial,
}: {
  productId: number;
  currentPrice: number | null;
  suggested: number | null;
  initial: AlertInitial;
}) {
  const t = useTranslations("Alerts");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState(initial ? String(initial.target_price) : suggested !== null ? String(suggested) : "");
  const [push, setPush] = useState(initial?.notify_push ?? false);
  const [email, setEmail] = useState(initial?.notify_email ?? true);
  const [error, setError] = useState<ActionError | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      setError(null);
      setInfo(null);
      const target = parsePriceInput(price);
      if (target === null || (!push && !email)) {
        setError("invalid");
        return;
      }
      let usePush = push;
      if (push) {
        const r = await setupPush(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
        if (r.ok) {
          const s = await savePushSubscription(r.subscription);
          if (!s.ok) usePush = false;
        } else usePush = false;
        if (!usePush) {
          setInfo(r.ok ? t("pushFailed") : t(`push_${r.reason}`));
          if (!email) {
            setPush(false);
            return;
          }
          setPush(false);
        }
      }
      const res = await saveAlert({ productId, targetPrice: target, notifyPush: usePush, notifyEmail: email });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });

  const remove = () =>
    start(async () => {
      if (!initial) return;
      const r = await deleteAlert({ alertId: initial.id });
      if (r.ok) {
        setOpen(false);
        router.refresh();
      } else setError(r.error);
    });

  if (!open) {
    return (
      <div className="flex flex-col gap-1">
        <button type="button" className={BTN_SECONDARY} onClick={() => setOpen(true)} aria-expanded={false}>
          {initial ? t("editButton") : t("createButton")}
        </button>
        {initial ? (
          <span className="text-xs text-muted">
            {initial.is_active ? t("activeSummary", { price: formatPrice(initial.target_price, locale) }) : t("pausedSummary")}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <form
      className="flex w-full max-w-sm flex-col gap-3 rounded-xl border border-border-subtle p-4"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <p className="font-semibold">{initial ? t("editTitle") : t("createTitle")}</p>
      {currentPrice !== null ? <p className="text-sm text-muted">{t("currentPrice", { price: formatPrice(currentPrice, locale) })}</p> : null}
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">{t("targetPrice")}</span>
        <input inputMode="decimal" required value={price} onChange={(e) => setPrice(e.target.value)} className={INPUT} />
        <span className="text-xs text-muted">{t("targetHint")}</span>
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">{t("channels")}</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} className="h-4 w-4 accent-accent" />
          {t("channelEmail")}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={push} onChange={(e) => setPush(e.target.checked)} className="h-4 w-4 accent-accent" />
          {t("channelPush")}
        </label>
        {push ? <span className="text-xs text-muted">{t("pushHint")}</span> : null}
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className={BTN}>
          {t("save")}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={BTN_SECONDARY}>
          {t("cancel")}
        </button>
        {initial ? (
          <button type="button" disabled={pending} onClick={remove} className={BTN_SECONDARY}>
            {t("delete")}
          </button>
        ) : null}
      </div>
      {info ? (
        <p role="status" className="text-sm">
          {info}
        </p>
      ) : null}
      <ErrorText error={error} />
    </form>
  );
}

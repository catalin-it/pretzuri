"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { type ActionError, clearHistory, deleteAlert, setAlertActive } from "@/lib/account/actions";
import { BTN_SECONDARY, ErrorText } from "./ui";

export function ClearHistoryButton() {
  const t = useTranslations("Account");
  const router = useRouter();
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={pending}
        className={`${BTN_SECONDARY} w-fit`}
        onClick={() => {
          if (!window.confirm(t("historyClearConfirm"))) return;
          start(async () => {
            const r = await clearHistory();
            if (r.ok) router.refresh();
            else setError(r.error);
          });
        }}
      >
        {t("historyClear")}
      </button>
      <ErrorText error={error} />
    </div>
  );
}

export function AlertRowActions({ alertId, active, title }: { alertId: number; active: boolean; title: string }) {
  const t = useTranslations("Alerts");
  const router = useRouter();
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: ActionError }>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (r.ok) router.refresh();
      else setError(r.error ?? "server");
    });
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          className={BTN_SECONDARY}
          aria-label={active ? t("pauseLabel", { title }) : t("resumeLabel", { title })}
          onClick={() => run(() => setAlertActive({ alertId, active: !active }))}
        >
          {active ? t("pause") : t("resume")}
        </button>
        <button
          type="button"
          disabled={pending}
          className={BTN_SECONDARY}
          aria-label={t("deleteLabel", { title })}
          onClick={() => run(() => deleteAlert({ alertId }))}
        >
          {t("delete")}
        </button>
      </div>
      <ErrorText error={error} />
    </div>
  );
}

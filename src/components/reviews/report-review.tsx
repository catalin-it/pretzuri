"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { type ActionError, reportReview } from "@/lib/account/actions";
import { REPORT_REASONS } from "@/lib/account/schemas";
import { BTN, BTN_SECONDARY, ErrorText, INPUT } from "@/components/account/ui";

/** DSA notice ("Raportează") for a published review. */
export function ReportReview({ reviewId, reported }: { reviewId: number; reported: boolean }) {
  const t = useTranslations("Reviews");
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(reported);
  const [reason, setReason] = useState<(typeof REPORT_REASONS)[number]>("illegal");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, start] = useTransition();

  if (done) return <p className="text-xs text-muted">{t("reported")}</p>;
  if (!open) {
    return (
      <button type="button" className="w-fit text-xs underline" onClick={() => setOpen(true)}>
        {t("report")}
      </button>
    );
  }
  return (
    <form
      className="flex max-w-md flex-col gap-2 rounded-lg border border-border-subtle p-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError(null);
          const r = await reportReview({ reviewId, reason, details });
          if (r.ok) setDone(true);
          else setError(r.error);
        });
      }}
    >
      <p className="text-sm font-semibold">{t("reportTitle")}</p>
      <label className="flex flex-col gap-1">
        <span className="text-sm">{t("reportReason")}</span>
        <select value={reason} onChange={(e) => setReason(e.target.value as typeof reason)} className={INPUT}>
          {REPORT_REASONS.map((r) => (
            <option key={r} value={r}>
              {t(`reason_${r}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm">{t("reportDetails")}</span>
        <textarea rows={3} maxLength={2000} value={details} onChange={(e) => setDetails(e.target.value)} className={INPUT} />
      </label>
      <p className="text-xs text-muted">{t("reportNote")}</p>
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={BTN}>
          {t("reportSend")}
        </button>
        <button type="button" className={BTN_SECONDARY} onClick={() => setOpen(false)}>
          {t("cancel")}
        </button>
      </div>
      <ErrorText error={error} />
    </form>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { type ActionError, deleteReview, saveReview } from "@/lib/account/actions";
import { BTN, BTN_SECONDARY, ErrorText, INPUT } from "@/components/account/ui";

export type OwnReview = {
  id: number;
  rating: number;
  title: string | null;
  body: string;
  status: string;
  moderation_reason: string | null;
} | null;

/** Write or edit the user's own review of a shop. Pre-moderated: every save goes (back) to "pending". */
export function ReviewForm({ merchantId, own }: { merchantId: number; own: OwnReview }) {
  const t = useTranslations("Reviews");
  const router = useRouter();
  const [editing, setEditing] = useState(!own);
  const [rating, setRating] = useState(own?.rating ?? 0);
  const [title, setTitle] = useState(own?.title ?? "");
  const [body, setBody] = useState(own?.body ?? "");
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, start] = useTransition();

  if (own && !editing) {
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-border-subtle p-4">
        <p className="text-sm font-semibold">{t("yourReview")}</p>
        <p className="text-sm" role="status">
          {t(`status_${own.status}`)}
        </p>
        {own.moderation_reason && (own.status === "rejected" || own.status === "removed") ? (
          <p className="text-sm text-muted">{t("reason", { reason: own.moderation_reason })}</p>
        ) : null}
        <p className="font-semibold">
          {"★".repeat(own.rating)}
          {"☆".repeat(5 - own.rating)}
          {own.title ? ` · ${own.title}` : ""}
        </p>
        <p className="whitespace-pre-line text-sm">{own.body}</p>
        <div className="flex gap-2">
          <button type="button" className={BTN_SECONDARY} onClick={() => setEditing(true)}>
            {t("edit")}
          </button>
          <button
            type="button"
            disabled={pending}
            className={BTN_SECONDARY}
            onClick={() => {
              if (!window.confirm(t("deleteConfirm"))) return;
              start(async () => {
                const r = await deleteReview({ reviewId: own.id });
                if (r.ok) router.refresh();
                else setError(r.error);
              });
            }}
          >
            {t("delete")}
          </button>
        </div>
        <ErrorText error={error} />
      </div>
    );
  }

  return (
    <form
      className="flex max-w-xl flex-col gap-3 rounded-xl border border-border-subtle p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (rating < 1) {
          setError("invalid");
          return;
        }
        start(async () => {
          setError(null);
          const r = await saveReview({ merchantId, rating, title, body });
          if (r.ok) {
            setEditing(false);
            router.refresh();
          } else setError(r.error);
        });
      }}
    >
      <p className="font-semibold">{own ? t("editTitle") : t("writeTitle")}</p>
      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm font-medium">{t("rating")}</legend>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="cursor-pointer text-2xl">
              <input type="radio" name="rating" value={n} checked={rating === n} onChange={() => setRating(n)} className="sr-only" />
              <span aria-hidden="true">{n <= rating ? "★" : "☆"}</span>
              <span className="sr-only">{t("stars", { rating: n })}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">{t("titleLabel")}</span>
        <input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} className={INPUT} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">{t("bodyLabel")}</span>
        <textarea
          required
          minLength={20}
          maxLength={4000}
          rows={5}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className={INPUT}
        />
        <span className="text-xs text-muted">{t("bodyHint")}</span>
      </label>
      <p className="text-xs text-muted">{t("moderationNote")}</p>
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={BTN}>
          {t("submit")}
        </button>
        {own ? (
          <button type="button" className={BTN_SECONDARY} onClick={() => setEditing(false)}>
            {t("cancel")}
          </button>
        ) : null}
      </div>
      <ErrorText error={error} />
    </form>
  );
}

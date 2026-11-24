"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { type ActionError, deleteAccount } from "@/lib/account/actions";
import { ErrorText, INPUT } from "./ui";

/** GDPR erasure. Confirmation: the user types their account email. */
export function DeleteAccount({ email }: { email: string }) {
  const t = useTranslations("Account");
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, start] = useTransition();
  const matches = email !== "" && typed.trim().toLowerCase() === email.toLowerCase();
  return (
    <form
      className="flex max-w-md flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!matches) return;
        start(async () => {
          setError(null);
          const r = await deleteAccount({ confirm: typed });
          if (r.ok) {
            router.replace("/");
            router.refresh();
          } else setError(r.error);
        });
      }}
    >
      <p className="text-sm">{t("deleteIntro")}</p>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">{t("deleteConfirmLabel", { email })}</span>
        <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" className={INPUT} />
      </label>
      <button
        type="submit"
        disabled={!matches || pending}
        className="w-fit rounded-lg border border-price-drop px-4 py-2 font-semibold text-price-drop disabled:opacity-50"
      >
        {t("deleteButton")}
      </button>
      <ErrorText error={error} />
    </form>
  );
}

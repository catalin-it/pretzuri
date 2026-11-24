"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { type ActionError, requestReauthCode, setPassword } from "@/lib/account/actions";
import { BTN, BTN_SECONDARY, ErrorText, INPUT } from "./ui";

/** Set or change the optional password. GoTrue requires a reauthentication code sent by email. */
export function PasswordForm() {
  const t = useTranslations("Account");
  const [step, setStep] = useState<"start" | "code" | "done">("start");
  const [code, setCode] = useState("");
  const [password, setPw] = useState("");
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, start] = useTransition();

  if (step === "done") {
    return (
      <p role="status" className="text-sm">
        {t("passwordSaved")}
      </p>
    );
  }
  if (step === "start") {
    return (
      <div className="flex max-w-md flex-col gap-2">
        <p className="text-sm text-muted">{t("passwordIntro")}</p>
        <button
          type="button"
          disabled={pending}
          className={`${BTN_SECONDARY} w-fit`}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await requestReauthCode();
              if (r.ok) setStep("code");
              else setError(r.error);
            })
          }
        >
          {t("passwordSendCode")}
        </button>
        <ErrorText error={error} />
      </div>
    );
  }
  return (
    <form
      className="flex max-w-md flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError(null);
          const r = await setPassword({ password, code });
          if (r.ok) setStep("done");
          else setError(r.error);
        });
      }}
    >
      <p role="status" className="text-sm">
        {t("passwordCodeSent")}
      </p>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">{t("passwordCode")}</span>
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          className={INPUT}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">{t("passwordNew")}</span>
        <input
          type="password"
          minLength={10}
          required
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPw(e.target.value)}
          className={INPUT}
        />
        <span className="text-xs text-muted">{t("passwordRules")}</span>
      </label>
      <button type="submit" disabled={pending} className={BTN}>
        {t("passwordSave")}
      </button>
      <ErrorText error={error} />
    </form>
  );
}

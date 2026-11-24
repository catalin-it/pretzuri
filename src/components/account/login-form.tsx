"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { type ActionError, passwordSignIn, requestCode, verifyCode } from "@/lib/account/actions";
import { BTN, BTN_SECONDARY, ErrorText, INPUT } from "./ui";

/** Email code sign-in (sign-up included) with an optional password tab. */
export function LoginForm({ next }: { next: string }) {
  const t = useTranslations("Auth");
  const locale = useLocale();
  const [mode, setMode] = useState<"code" | "password">("code");
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, start] = useTransition();

  const done = () => window.location.assign(next);

  const send = () =>
    start(async () => {
      setError(null);
      const r = await requestCode({ email, locale });
      if (r.ok) setStep("code");
      else setError(r.error);
    });

  const verify = () =>
    start(async () => {
      setError(null);
      const r = await verifyCode({ email, code });
      if (r.ok) done();
      else setError(r.error);
    });

  const signIn = () =>
    start(async () => {
      setError(null);
      const r = await passwordSignIn({ email, password });
      if (r.ok) done();
      else setError(r.error);
    });

  return (
    <div className="flex max-w-sm flex-col gap-4">
      <div role="tablist" aria-label={t("methods")} className="flex gap-2">
        {(["code", "password"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => {
              setMode(m);
              setError(null);
            }}
            className={`${BTN_SECONDARY} ${mode === m ? "border-accent font-semibold" : ""}`}
          >
            {m === "code" ? t("tabCode") : t("tabPassword")}
          </button>
        ))}
      </div>

      {mode === "code" && step === "email" ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">{t("email")}</span>
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={INPUT} />
          </label>
          <p className="text-sm text-muted">{t("codeHint")}</p>
          <button type="submit" disabled={pending} className={BTN}>
            {t("sendCode")}
          </button>
        </form>
      ) : null}

      {mode === "code" && step === "code" ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            verify();
          }}
        >
          <p className="text-sm" role="status">
            {t("codeSent", { email })}
          </p>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">{t("code")}</span>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className={`${INPUT} tracking-[0.4em]`}
            />
          </label>
          <button type="submit" disabled={pending} className={BTN}>
            {t("signIn")}
          </button>
          <div className="flex gap-2">
            <button type="button" disabled={pending} onClick={send} className={BTN_SECONDARY}>
              {t("resend")}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("email");
                setCode("");
                setError(null);
              }}
              className={BTN_SECONDARY}
            >
              {t("changeEmail")}
            </button>
          </div>
        </form>
      ) : null}

      {mode === "password" ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            signIn();
          }}
        >
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">{t("email")}</span>
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={INPUT} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">{t("password")}</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={INPUT}
            />
          </label>
          <p className="text-sm text-muted">{t("passwordHint")}</p>
          <button type="submit" disabled={pending} className={BTN}>
            {t("signIn")}
          </button>
        </form>
      ) : null}

      <ErrorText error={error} />
    </div>
  );
}

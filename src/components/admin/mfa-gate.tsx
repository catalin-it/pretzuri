"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";

type Enrollment = { factorId: string; qr: string; secret: string };

/**
 * TOTP step-up for the admin area (GoTrue MFA). "enroll": first TOTP factor (QR + secret), "challenge": code for the
 * existing factor. On success the session becomes aal2 (cookies updated by the browser client) and we reload.
 */
export function MfaGate({ mode, locale }: { mode: "enroll" | "challenge"; locale: string }) {
  const t = useTranslations("Admin.mfa");
  const router = useRouter();
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startEnroll() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    // Abandoned enrollments leave unverified factors behind; GoTrue refuses a new one with the same name.
    const { data: list } = await supabase.auth.mfa.listFactors();
    for (const f of list?.all ?? []) {
      if (f.factor_type === "totp" && f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error: err } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Pretzuri admin ${Date.now()}` });
    setBusy(false);
    if (err || !data) {
      setError(t("enrollFailed"));
      return;
    }
    setEnrollment({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code.trim())) {
      setError(t("codeFormat"));
      return;
    }
    setBusy(true);
    setError(null);
    const supabase = createClient();
    let factorId = enrollment?.factorId;
    if (!factorId) {
      const { data } = await supabase.auth.mfa.listFactors();
      factorId = data?.totp.find((f) => f.status === "verified")?.id;
    }
    if (!factorId) {
      setBusy(false);
      setError(t("noFactor"));
      return;
    }
    const { error: err } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
    if (err) {
      setBusy(false);
      setError(t("wrongCode"));
      return;
    }
    // The aal2 session cookies are already written by the browser client; the server reads them on this request.
    router.replace(`/${locale}/admin`);
    router.refresh();
  }

  const showForm = mode === "challenge" || enrollment !== null;
  return (
    <section className="flex max-w-md flex-col gap-4">
      <h1 className="text-2xl font-bold">{t(mode === "enroll" ? "enrollTitle" : "challengeTitle")}</h1>
      <p className="text-sm text-muted">{t(mode === "enroll" ? "enrollIntro" : "challengeIntro")}</p>
      {mode === "enroll" && !enrollment ? (
        <button type="button" onClick={startEnroll} disabled={busy} className="self-start rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-contrast">
          {t("enrollStart")}
        </button>
      ) : null}
      {enrollment ? (
        <div className="flex flex-col gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- data: URL from GoTrue */}
          <img src={enrollment.qr} alt={t("qrAlt")} width={200} height={200} className="rounded-lg bg-white p-2" />
          <p className="text-sm">
            {t("secret")} <code className="break-all font-mono">{enrollment.secret}</code>
          </p>
        </div>
      ) : null}
      {showForm ? (
        <form onSubmit={verify} className="flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-sm font-medium">
            {t("code")}
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              required
              className="w-40 rounded-lg border border-border bg-background px-3 py-2 font-mono text-lg tracking-widest"
            />
          </label>
          <button type="submit" disabled={busy} className="self-start rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-contrast">
            {t("verify")}
          </button>
        </form>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-price-drop">
          {error}
        </p>
      ) : null}
    </section>
  );
}

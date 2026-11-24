"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { type ActionError, updateProfile } from "@/lib/account/actions";
import { BTN, ErrorText, INPUT } from "./ui";

type Profile = { display_name: string | null; locale: string; email_alerts: boolean };

export function ProfileForm({ profile }: { profile: Profile }) {
  const t = useTranslations("Account");
  const [name, setName] = useState(profile.display_name ?? "");
  const [locale, setLocale] = useState<"ro" | "en">(profile.locale === "en" ? "en" : "ro");
  const [emailAlerts, setEmailAlerts] = useState(profile.email_alerts);
  const [error, setError] = useState<ActionError | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex max-w-md flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError(null);
          setSaved(false);
          const r = await updateProfile({ displayName: name, locale, emailAlerts });
          if (r.ok) setSaved(true);
          else setError(r.error);
        });
      }}
    >
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">{t("displayName")}</span>
        <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} className={INPUT} autoComplete="nickname" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">{t("language")}</span>
        <select value={locale} onChange={(e) => setLocale(e.target.value === "en" ? "en" : "ro")} className={INPUT}>
          <option value="ro">Română</option>
          <option value="en">English</option>
        </select>
        <span className="text-xs text-muted">{t("languageHint")}</span>
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={emailAlerts}
          onChange={(e) => setEmailAlerts(e.target.checked)}
          className="h-4 w-4 accent-accent"
        />
        <span className="text-sm">{t("emailAlerts")}</span>
      </label>
      <button type="submit" disabled={pending} className={BTN}>
        {t("save")}
      </button>
      {saved ? (
        <p role="status" className="text-sm">
          {t("saved")}
        </p>
      ) : null}
      <ErrorText error={error} />
    </form>
  );
}

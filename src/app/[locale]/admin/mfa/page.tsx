import { notFound, redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getAdminContext } from "@/lib/admin/guard";
import { MfaGate } from "@/components/admin/mfa-gate";

type Props = { params: Promise<{ locale: string }> };

/** TOTP step-up: admins without an aal2 session land here (enroll the first factor, or enter a code). */
export default async function AdminMfaPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const ctx = await getAdminContext();
  if (!ctx) notFound();
  if (ctx.mfa === "ok") redirect(`/${locale}/admin`);
  return <MfaGate mode={ctx.mfa} locale={locale} />;
}

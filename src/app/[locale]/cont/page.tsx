import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { DeleteAccount } from "@/components/account/delete-account";
import { PasswordForm } from "@/components/account/password-form";
import { ProfileForm } from "@/components/account/profile-form";
import { getProfile } from "@/lib/account/queries";
import { requireUser } from "@/lib/auth/session";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Account" });
  return { title: t("title") };
}

export default async function AccountPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale, "/cont");
  const [t, profile] = await Promise.all([getTranslations("Account"), getProfile()]);
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <section aria-labelledby="profile-h" className="flex flex-col gap-3">
        <h2 id="profile-h" className="text-xl font-bold">
          {t("profileTitle")}
        </h2>
        <ProfileForm profile={profile ?? { display_name: null, locale, email_alerts: true }} />
      </section>
      <section aria-labelledby="password-h" className="flex flex-col gap-3">
        <h2 id="password-h" className="text-xl font-bold">
          {t("passwordTitle")}
        </h2>
        <PasswordForm />
      </section>
      <section aria-labelledby="data-h" className="flex flex-col gap-3">
        <h2 id="data-h" className="text-xl font-bold">
          {t("dataTitle")}
        </h2>
        <p className="max-w-prose text-sm text-muted">{t("exportIntro")}</p>
        {/* Plain link: a file download (route handler), not a page navigation. */}
        <a
          href="/api/account/export"
          download
          className="w-fit rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface"
        >
          {t("exportButton")}
        </a>
      </section>
      <section aria-labelledby="delete-h" className="flex flex-col gap-3">
        <h2 id="delete-h" className="text-xl font-bold">
          {t("deleteTitle")}
        </h2>
        <DeleteAccount email={user.email ?? ""} />
      </section>
    </div>
  );
}

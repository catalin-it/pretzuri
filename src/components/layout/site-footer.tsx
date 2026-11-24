import { getTranslations } from "next-intl/server";
import { appVersion } from "@/lib/app-version";

export async function SiteFooter() {
  const t = await getTranslations("Footer");
  return (
    <footer className="border-t border-border-subtle bg-surface text-sm text-muted">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6">
        <p>{t("disclosure")}</p>
        <p>
          Pretzuri {appVersion.version}
          {appVersion.env === "dev" ? ` · DEV · ${appVersion.commit}` : ""}
        </p>
      </div>
    </footer>
  );
}

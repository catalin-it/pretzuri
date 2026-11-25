import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { localeAlternates } from "@/lib/seo";

type Section = { h: string; p: string[]; operator?: boolean };
export type TextNamespace = "RankingPage" | "AffiliatePage" | "PrivacyPage" | "TermsPage";

export async function textPageMetadata(locale: string, ns: TextNamespace, path: string): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: ns });
  return { title: t("title"), description: t("intro"), alternates: localeAlternates(locale, path) };
}

/** Text page from messages: `title`, `intro`, `sections: [{h, p: []}]`; legal drafts show a review notice. */
export async function TextPage({ locale, ns, draft = false }: { locale: string; ns: TextNamespace; draft?: boolean }) {
  setRequestLocale(locale);
  const [t, common, op] = await Promise.all([
    getTranslations(ns),
    getTranslations("Common"),
    getTranslations("LegalOperator"),
  ]);
  const sections = t.raw("sections") as Section[];
  return (
    <article className="flex max-w-3xl flex-col gap-4">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      {draft ? (
        <p role="note" className="rounded-xl border border-promoted bg-promoted-soft p-3 text-sm font-semibold">
          {common("legalDraft")}
        </p>
      ) : null}
      <p className="text-lg">{t("intro")}</p>
      {sections.map((s) => (
        <section key={s.h} className="flex flex-col gap-2">
          <h2 className="text-xl font-semibold">{s.h}</h2>
          {s.p.map((para, i) => (
            <p key={i}>{para}</p>
          ))}
          {s.operator ? (
            <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
              {(["company", "cui", "address", "email"] as const).map((f) => (
                <div key={f} className="contents">
                  <dt className="font-semibold">{op(`labels.${f}`)}</dt>
                  <dd>{op(f)}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </section>
      ))}
    </article>
  );
}

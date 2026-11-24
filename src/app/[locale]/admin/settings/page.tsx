import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { requireAdmin } from "@/lib/admin/guard";
import { saveSettings } from "@/lib/admin/actions";
import { formatBytes, formatDateTime } from "@/lib/admin/format";
import { SETTING_KEYS, SETTINGS_SPEC, settingToInput } from "@/lib/admin/schemas";
import { cls, Flash, FormContext, type SearchParams } from "@/components/admin/ui";

type Props = { params: Promise<{ locale: string }>; searchParams: SearchParams };

/** Matching thresholds and feed limits (settings table). Validated with zod here and again in admin_update_settings. */
export default async function AdminSettings({ params, searchParams }: Props) {
  const { locale } = await params;
  const sp = await searchParams;
  const { supabase } = await requireAdmin(locale);
  const loc = locale as Locale;
  const t = await getTranslations("Admin.settings");
  const tc = await getTranslations("Admin.common");
  const { data, error } = await supabase.from("settings").select("key, value, updated_at").in("key", SETTING_KEYS);
  if (error) throw new Error(`settings: ${error.message}`);
  const byKey = new Map(data.map((s) => [s.key, s]));
  const back = `/${locale}/admin/settings`;

  return (
    <section className="flex max-w-3xl flex-col gap-4">
      <h1 className={cls.h1}>{t("title")}</h1>
      <p className={cls.muted}>{t("intro")}</p>
      <Flash ok={sp.ok} err={sp.err} />
      <form action={saveSettings} className="flex flex-col gap-4">
        <FormContext locale={locale} back={back} />
        {SETTING_KEYS.map((key) => {
          const row = byKey.get(key);
          if (!row) return null;
          const spec = SETTINGS_SPEC[key];
          const hint =
            spec.kind === "list"
              ? t("hintList", { max: spec.maxItems })
              : t("hintRange", { min: spec.min, max: spec.max }) +
                (key === "feed_max_bytes" ? ` (${formatBytes(Number(row.value), loc)})` : "");
          return (
            <label key={key} className={cls.label}>
              <span>
                {t(`k_${key}`)} <code className="text-xs text-muted">{key}</code>
              </span>
              {spec.kind === "list" ? (
                <textarea name={key} rows={3} defaultValue={settingToInput(key, row.value)} className={`${cls.input} font-mono`} />
              ) : (
                <input
                  name={key}
                  type="number"
                  required
                  min={spec.min}
                  max={spec.max}
                  step={spec.kind === "int" ? 1 : spec.step}
                  defaultValue={settingToInput(key, row.value)}
                  className={cls.input}
                />
              )}
              <span className="text-xs font-normal text-muted">
                {t(`d_${key}`)} {hint} · {t("updated", { date: formatDateTime(row.updated_at, loc) })}
              </span>
            </label>
          );
        })}
        <p className={cls.muted}>{t("thresholdNote")}</p>
        <button type="submit" className={`${cls.btn} self-start`}>
          {tc("save")}
        </button>
      </form>
    </section>
  );
}

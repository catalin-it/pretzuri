import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { requireAdmin } from "@/lib/admin/guard";
import { setAdminRole } from "@/lib/admin/actions";
import { formatDateTime } from "@/lib/admin/format";
import { formatNumber } from "@/lib/format";
import { cls, Flash, FormContext, Pager, pageParam, Pill, type SearchParams } from "@/components/admin/ui";

type Props = { params: Promise<{ locale: string }>; searchParams: SearchParams };
const PAGE = 50;

/** Accounts (e-mail via admin_list_users), activity counts and the admin role. No editing of personal data. */
export default async function AdminUsers({ params, searchParams }: Props) {
  const { locale } = await params;
  const sp = await searchParams;
  const { supabase, user } = await requireAdmin(locale);
  const loc = locale as Locale;
  const t = await getTranslations("Admin.users");
  const tc = await getTranslations("Admin.common");
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const page = pageParam(sp.page);
  const { data, error } = await supabase.rpc("admin_list_users", {
    p_search: q,
    p_limit: PAGE,
    p_offset: (page - 1) * PAGE,
  });
  if (error) throw new Error(`admin_list_users: ${error.message}`);
  const total = data.length ? Number(data[0].total_count) : 0;
  const n = (v: number) => formatNumber(v, loc);
  const back = `/${locale}/admin/users${q ? `?${new URLSearchParams({ q })}` : ""}`;

  return (
    <section className="flex flex-col gap-4">
      <h1 className={cls.h1}>{t("title")}</h1>
      <Flash ok={sp.ok} err={sp.err} />
      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className={cls.label}>
          {t("search")}
          <input name="q" type="search" defaultValue={q} className={cls.input} />
        </label>
        <button type="submit" className={cls.btnSecondary}>
          {tc("filter")}
        </button>
        <span className={cls.muted}>{t("total", { count: total })}</span>
      </form>
      <div className="overflow-x-auto">
        <table className={cls.table}>
          <thead>
            <tr>
              <th className={cls.th}>{t("email")}</th>
              <th className={cls.th}>{t("created")}</th>
              <th className={cls.th}>{t("lastSignIn")}</th>
              <th className={cls.th}>{t("favorites")}</th>
              <th className={cls.th}>{t("alerts")}</th>
              <th className={cls.th}>{t("reviews")}</th>
              <th className={cls.th}>{t("role")}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((u) => (
              <tr key={u.id}>
                <td className={`${cls.td} break-all`}>
                  {u.email}
                  {u.has_mfa ? (
                    <>
                      {" "}
                      <Pill>{t("mfa")}</Pill>
                    </>
                  ) : null}
                </td>
                <td className={cls.td}>{formatDateTime(u.created_at, loc)}</td>
                <td className={cls.td}>{u.last_sign_in_at ? formatDateTime(u.last_sign_in_at, loc) : "–"}</td>
                <td className={cls.td}>{n(u.favorites_count)}</td>
                <td className={cls.td}>{n(u.alerts_count)}</td>
                <td className={cls.td}>{n(u.reviews_count)}</td>
                <td className={cls.td}>
                  <div className="flex flex-wrap items-center gap-2">
                    {u.is_admin ? <Pill tone="ok">{t("admin")}</Pill> : null}
                    {u.id === user.id ? (
                      <span className={cls.muted}>{t("you")}</span>
                    ) : (
                      <form action={setAdminRole}>
                        <FormContext locale={locale} back={back} />
                        <input type="hidden" name="user_id" value={u.id} />
                        <input type="hidden" name="grant" value={u.is_admin ? "0" : "1"} />
                        <button type="submit" className={u.is_admin ? cls.btnDanger : cls.btnSecondary}>
                          {u.is_admin ? t("revoke") : t("grant")}
                        </button>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager
        base={`/${locale}/admin/users`}
        page={page}
        hasNext={page * PAGE < total}
        labels={{ prev: tc("prev"), next: tc("next"), nav: tc("pagination") }}
        params={q ? { q } : {}}
      />
    </section>
  );
}

import { getTranslations } from "next-intl/server";
import { saveFeedSource, saveMerchant } from "@/lib/admin/actions";
import { FEED_TYPES } from "@/lib/admin/schemas";
import { cls, FormContext } from "./ui";

type Merchant = {
  id: number;
  slug: string;
  name: string;
  website: string;
  description: string | null;
  shipping_info: string | null;
  has_affiliate: boolean;
  affiliate_network: string | null;
  is_active: boolean;
};

/** Create (no merchant) or edit a merchant. */
export async function MerchantForm({ locale, back, merchant }: { locale: string; back: string; merchant?: Merchant }) {
  const t = await getTranslations("Admin.merchants");
  const tc = await getTranslations("Admin.common");
  return (
    <form action={saveMerchant} className="grid gap-3 sm:grid-cols-2">
      <FormContext locale={locale} back={back} />
      {merchant ? <input type="hidden" name="id" value={merchant.id} /> : null}
      <label className={cls.label}>
        {t("name")}
        <input name="name" required minLength={2} maxLength={120} defaultValue={merchant?.name} className={cls.input} />
      </label>
      <label className={cls.label}>
        {t("slug")}
        <input name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={60} defaultValue={merchant?.slug} className={cls.input} />
      </label>
      <label className={cls.label}>
        {t("website")}
        <input name="website" type="url" required defaultValue={merchant?.website} className={cls.input} />
      </label>
      <label className={cls.label}>
        {t("network")}
        <select name="affiliate_network" defaultValue={merchant?.affiliate_network ?? ""} className={cls.input}>
          <option value="">{t("networkNone")}</option>
          <option value="2performant">2Performant</option>
          <option value="profitshare">Profitshare</option>
        </select>
      </label>
      <label className={`${cls.label} sm:col-span-2`}>
        {t("description")}
        <textarea name="description" maxLength={2000} rows={2} defaultValue={merchant?.description ?? ""} className={cls.input} />
      </label>
      <label className={`${cls.label} sm:col-span-2`}>
        {t("shippingInfo")}
        <textarea name="shipping_info" maxLength={1000} rows={2} defaultValue={merchant?.shipping_info ?? ""} className={cls.input} />
      </label>
      <label className={cls.check}>
        <input type="checkbox" name="has_affiliate" defaultChecked={merchant?.has_affiliate ?? false} />
        {t("hasAffiliate")}
      </label>
      <label className={cls.check}>
        <input type="checkbox" name="is_active" defaultChecked={merchant?.is_active ?? true} />
        {tc("active")}
      </label>
      <div className="sm:col-span-2">
        <button type="submit" className={cls.btn}>
          {merchant ? tc("save") : t("create")}
        </button>
      </div>
    </form>
  );
}

type Feed = {
  id: number;
  name: string;
  type: string;
  url: string;
  options: unknown;
  schedule_minutes: number;
  is_active: boolean;
};

/** Create (merchantId) or edit (feed) a feed source. Options are a JSON object (parser options, field_map). */
export async function FeedForm({ locale, back, feed, merchantId }: { locale: string; back: string; feed?: Feed; merchantId?: number }) {
  const t = await getTranslations("Admin.feeds");
  const tc = await getTranslations("Admin.common");
  const options =
    feed && feed.options && typeof feed.options === "object" && Object.keys(feed.options).length
      ? JSON.stringify(feed.options, null, 2)
      : "";
  return (
    <form action={saveFeedSource} className="grid gap-3 sm:grid-cols-2">
      <FormContext locale={locale} back={back} />
      {feed ? <input type="hidden" name="id" value={feed.id} /> : <input type="hidden" name="merchant_id" value={merchantId} />}
      <label className={cls.label}>
        {t("name")}
        <input name="name" required maxLength={120} defaultValue={feed?.name} className={cls.input} />
      </label>
      <label className={cls.label}>
        {t("type")}
        <select name="type" defaultValue={feed?.type ?? "direct_xml"} className={cls.input}>
          {FEED_TYPES.map((ft) => (
            <option key={ft} value={ft}>
              {t(`type_${ft}`)}
            </option>
          ))}
        </select>
      </label>
      <label className={`${cls.label} sm:col-span-2`}>
        {t("url")}
        <input name="url" type="url" required maxLength={2000} defaultValue={feed?.url} className={cls.input} autoComplete="off" />
        <span className="text-xs font-normal text-muted">{t("urlHint")}</span>
      </label>
      <label className={`${cls.label} sm:col-span-2`}>
        {t("options")}
        <textarea name="options" rows={3} maxLength={10000} defaultValue={options} placeholder='{"delimiter":";"}' className={`${cls.input} font-mono`} />
        <span className="text-xs font-normal text-muted">{t("optionsHint")}</span>
      </label>
      <label className={cls.label}>
        {t("schedule")}
        <input name="schedule_minutes" type="number" min={15} max={10080} required defaultValue={feed?.schedule_minutes ?? 360} className={cls.input} />
      </label>
      <label className={`${cls.check} self-end`}>
        <input type="checkbox" name="is_active" defaultChecked={feed?.is_active ?? true} />
        {tc("active")}
      </label>
      <div className="sm:col-span-2">
        <button type="submit" className={cls.btn}>
          {feed ? tc("save") : t("create")}
        </button>
      </div>
    </form>
  );
}

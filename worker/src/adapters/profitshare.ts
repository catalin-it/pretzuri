import type { Adapter } from "./types.js";

/**
 * Profitshare affiliate product feed (XML, one <product> per item; CSV exports use the same names).
 * Default tag map below (not verified against current Profitshare docs, which are behind the affiliate
 * login: check the first real feed and override with feed_sources.options.field_map / item_tag).
 * `product_link` is the Profitshare tracking link and is kept unchanged as the affiliate URL.
 */
export const profitshare: Adapter = {
  type: "profitshare",
  format: "xml",
  defaultItemTag: "product",
  affiliate: true,
  fieldMap: {
    id: ["product_code", "product_id", "id", "code"],
    title: ["product_name", "name", "title"],
    description: ["product_description", "description"],
    gtin: ["product_ean", "ean", "gtin"],
    brand: ["brand", "manufacturer", "product_brand"],
    mpn: ["product_mpn", "mpn", "part_number", "model"],
    category: ["category_name", "category", "subcategory_name", "subcategory"],
    price: ["product_price_vat", "price_vat", "product_price", "price"],
    oldPrice: ["product_price_old", "old_price", "price_old", "product_old_price"],
    currency: ["currency", "product_currency"],
    availability: ["product_availability", "availability", "stock"],
    active: ["product_active", "active"],
    shippingCost: ["shipping_cost", "delivery_cost", "product_shipping"],
    shippingDays: ["shipping_days", "delivery_time"],
    url: ["product_url", "url", "product_page"],
    affiliateUrl: ["product_link", "affiliate_link", "link"],
    imageUrl: ["image", "image_url", "product_image", "images"],
  },
};

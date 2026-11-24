import type { Adapter } from "./types.js";

/**
 * 2Performant affiliate product feed (CSV). Default column map below; every field accepts several header
 * spellings (headers are normalized: "Image URLs" -> "image_urls"). Override per source with
 * feed_sources.options.field_map, e.g. {"affiliateUrl": "aff_link"}.
 *
 * Confirmed from the 2Performant merchant feed guide: title, description, price (sale price, "." decimal),
 * old price, category, product URL, images (comma separated), product id, availability, brand, gtin.
 * Affiliate export columns (short_message, subcategory, aff_code, product_active, campaign_name) follow the
 * common 2Performant affiliate CSV and are not verified against current docs: check the first real feed.
 */
export const twoPerformant: Adapter = {
  type: "2performant",
  format: "csv",
  affiliate: true,
  fieldMap: {
    id: ["product_id", "id", "unique_id", "sku"],
    title: ["title", "product_name", "name"],
    description: ["description", "short_message", "short_description"],
    gtin: ["gtin", "ean", "barcode", "upc"],
    brand: ["brand", "manufacturer"],
    mpn: ["mpn", "manufacturer_code", "model", "part_number"],
    category: ["category", "subcategory"],
    price: ["price", "sale_price", "price_vat"],
    oldPrice: ["old_price", "regular_price", "full_price"],
    currency: ["currency"],
    availability: ["availability", "stock", "in_stock", "stock_status"],
    active: ["product_active", "active"],
    shippingCost: ["shipping_cost", "shipping", "delivery_cost"],
    shippingDays: ["shipping_days", "delivery_time"],
    url: ["url", "product_url", "link"],
    affiliateUrl: ["aff_code", "affiliate_link", "aff_link", "affiliate_url", "generated_link"],
    imageUrl: ["image_urls", "images", "image_url", "image"],
  },
};

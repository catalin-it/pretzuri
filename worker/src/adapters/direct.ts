import type { Adapter, FieldMap } from "./types.js";

/** Pretzuri direct partner format v1 (docs/FEED-FORMAT.md). No affiliate URL. */
const fieldMap: FieldMap = {
  id: ["id", "sku"],
  title: ["title", "name"],
  description: ["description"],
  gtin: ["gtin", "ean"],
  brand: ["brand"],
  mpn: ["mpn"],
  category: ["category"],
  price: ["price"],
  oldPrice: ["old_price"],
  currency: ["currency"],
  availability: ["availability"],
  active: ["active"],
  shippingCost: ["shipping_cost"],
  shippingDays: ["shipping_days"],
  url: ["url", "link"],
  affiliateUrl: [],
  imageUrl: ["image_url", "image"],
};

export const directXml: Adapter = {
  type: "direct_xml",
  format: "xml",
  defaultItemTag: "product",
  affiliate: false,
  fieldMap,
};

export const directCsv: Adapter = { type: "direct_csv", format: "csv", affiliate: false, fieldMap };

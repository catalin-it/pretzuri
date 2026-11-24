/** One feed row as strings, after the adapter's field map (network names -> our names). */
export interface RawOffer {
  id?: string;
  title?: string;
  description?: string;
  gtin?: string;
  brand?: string;
  mpn?: string;
  /** Category path parts (e.g. [category, subcategory]); joined with " > ". */
  category?: string[];
  price?: string;
  oldPrice?: string;
  currency?: string;
  availability?: string;
  /** 2Performant "product_active" style flag: "0"/"false" = drop the row. */
  active?: string;
  shippingCost?: string;
  shippingDays?: string;
  url?: string;
  affiliateUrl?: string;
  imageUrl?: string;
  specs?: Record<string, string>;
}

export type FeedType = "2performant" | "profitshare" | "direct_xml" | "direct_csv";

export type RawField = Exclude<keyof RawOffer, "specs">;

/** Candidate source column/tag names per field (normalized: lower case, non-alphanumerics -> "_"). */
export type FieldMap = Record<RawField, string[]>;

export interface SourceOptions {
  /** CSV delimiter; sniffed from the header line when absent. */
  delimiter?: string;
  /** Text encoding of the feed (default utf-8). */
  encoding?: string;
  /** XML element that wraps one product. */
  item_tag?: string;
  /** Override of the adapter's default map, e.g. {"price": "pret_cu_tva"} or {"category": ["cat1","cat2"]}. */
  field_map?: Partial<Record<RawField, string | string[]>>;
}

/** One parsed record before mapping: normalized keys -> trimmed text, plus <spec name=".."> pairs (XML). */
export interface FlatRecord {
  fields: Record<string, string>;
  specs?: Record<string, string>;
}

export interface Adapter {
  type: FeedType;
  format: "csv" | "xml";
  defaultItemTag?: string;
  fieldMap: FieldMap;
  /** Whether offers keep an affiliate URL (network feeds) or not (direct partner feeds). */
  affiliate: boolean;
}

import { Readable } from "node:stream";
import { directCsv, directXml } from "./direct.js";
import { mapRecord, resolveFieldMap } from "./map.js";
import { profitshare } from "./profitshare.js";
import { twoPerformant } from "./twoperformant.js";
import type { Adapter, FeedType, RawOffer, SourceOptions } from "./types.js";
import { parseCsvRecords } from "../parse/csv.js";
import { parseXmlRecords } from "../parse/xml.js";

export const adapters: Record<FeedType, Adapter> = {
  "2performant": twoPerformant,
  profitshare,
  direct_xml: directXml,
  direct_csv: directCsv,
};

export function getAdapter(type: string): Adapter {
  const a = adapters[type as FeedType];
  if (!a) throw new Error(`unknown feed type ${type}`);
  return a;
}

export type RowEvent = { row: number; offer: RawOffer } | { row: number; error: string };

/**
 * Streams a feed body through the adapter: one RawOffer (or a row-level parse error) at a time.
 * The parser (CSV or XML) is the adapter's format.
 */
export async function* readOffers(
  adapter: Adapter,
  body: Readable,
  options: SourceOptions = {},
): AsyncGenerator<RowEvent> {
  const map = resolveFieldMap(adapter.fieldMap, options);
  const records =
    adapter.format === "xml"
      ? parseXmlRecords(body, { itemTag: options.item_tag ?? adapter.defaultItemTag ?? "product", encoding: options.encoding })
      : parseCsvRecords(body, { delimiter: options.delimiter, encoding: options.encoding });
  let row = 0;
  for await (const rec of records) {
    row++;
    if ("error" in rec) yield { row, error: rec.error };
    else yield { row, offer: mapRecord(rec, map) };
  }
}

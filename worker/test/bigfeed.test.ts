import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { getAdapter, readOffers } from "../src/adapters/index.js";
import { normalizeOffer } from "../src/normalize/offer.js";

const ROWS = Number(process.env.BIG_FEED_ROWS ?? 200_000);

/** Generates a 2Performant-style CSV on the fly (never held in memory as a whole). */
function* generate(rows: number): Generator<string> {
  yield "product_id,title,description,price,old_price,category,subcategory,url,image_urls,brand,gtin,product_active,aff_code\n";
  let chunk = "";
  for (let i = 1; i <= rows; i++) {
    chunk +=
      `P${i},"Telefon mobil Test Model ${i % 5000}, 128GB, Negru","Descriere produs ${i} cu text, virgule si ""ghilimele"".",` +
      `${(100 + (i % 9000)).toFixed(2)},,Telefoane,Telefoane mobile,https://shop.example.ro/p/${i},https://shop.example.ro/i/${i}.jpg,` +
      `Brand${i % 50},,1,https://event.2performant.com/events/click?x=${i}\n`;
    if (i % 1000 === 0) {
      yield chunk;
      chunk = "";
    }
  }
  if (chunk) yield chunk;
}

describe.skipIf(process.env.SKIP_BIG_FEED === "1")("big feed streaming", () => {
  it(`parses ${ROWS} CSV rows with bounded memory`, async () => {
    const before = process.memoryUsage.rss();
    let peak = before;
    let ok = 0;
    const body = Readable.from(generate(ROWS), { objectMode: false });
    for await (const ev of readOffers(getAdapter("2performant"), body)) {
      if ("offer" in ev && normalizeOffer(ev.offer, { affiliate: true, allowedCurrencies: ["RON"] }).ok) ok++;
      if (ok % 5000 === 0) peak = Math.max(peak, process.memoryUsage.rss());
    }
    peak = Math.max(peak, process.memoryUsage.rss());
    expect(ok).toBe(ROWS);
    const peakMb = peak / 1024 / 1024;
    console.log(`big feed: ${ROWS} rows, rss before ${Math.round(before / 1048576)} MB, peak ${Math.round(peakMb)} MB`);
    expect(peakMb).toBeLessThan(300);
  });
});

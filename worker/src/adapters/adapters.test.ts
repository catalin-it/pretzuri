import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { normalizeOffer } from "../normalize/offer.js";
import { getAdapter, readOffers, type RowEvent } from "./index.js";
import type { RawOffer, SourceOptions } from "./types.js";

const fixtures = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../fixtures");

async function collect(type: string, file: string, options: SourceOptions = {}): Promise<RowEvent[]> {
  const out: RowEvent[] = [];
  for await (const ev of readOffers(getAdapter(type), fs.createReadStream(path.join(fixtures, file), { highWaterMark: 512 }), options)) {
    out.push(ev);
  }
  return out;
}
const offers = (evs: RowEvent[]): RawOffer[] => evs.flatMap((e) => ("offer" in e ? [e.offer] : []));
const valid = (evs: RowEvent[], affiliate: boolean) =>
  offers(evs).map((o) => normalizeOffer(o, { affiliate, allowedCurrencies: ["RON"] }));

describe("2Performant adapter (CSV)", () => {
  it("maps the sample feed", async () => {
    const evs = await collect("2performant", "2performant-sample.csv");
    expect(evs).toHaveLength(20);
    const o = offers(evs)[0]!;
    expect(o).toMatchObject({
      id: "MS1001",
      title: "Telefon mobil Samsung Galaxy S24, 256GB, 8GB RAM, Dual SIM, Onyx Black",
      price: "3499.99",
      oldPrice: "3999.99",
      category: ["Telefoane & Tablete", "Telefoane mobile"],
      brand: "Samsung",
      gtin: "8806095299914",
      active: "1",
      url: "https://megashop-test.example.ro/p/ms1001",
    });
    expect(o.affiliateUrl).toMatch(/^https:\/\/event\.2performant\.com\/events\/click\?/);
    expect(o.imageUrl).toContain("MS1001.jpg,");
    expect(valid(evs, true).every((r) => r.ok)).toBe(true);
  });

  it("honours a field_map override", async () => {
    const evs = await collect("2performant", "2performant-sample.csv", { field_map: { title: "short_message" } });
    expect(offers(evs)[0]!.title).toBe("Telefon mobil Samsung Galaxy S24, 256GB, 8GB RAM, Dual SIM,");
  });

  it("reports broken rows without stopping", async () => {
    const evs = await collect("2performant", "2performant-bad.csv");
    const res = valid(evs, true);
    const ok = res.filter((r) => r.ok);
    const skipped = res.filter((r) => !r.ok && r.skip);
    // good row, bad-GTIN row (warning only) and the duplicate id (rejected later by the pipeline)
    expect(ok).toHaveLength(3);
    expect(skipped).toHaveLength(1);
    expect(evs.length).toBeGreaterThanOrEqual(10);
  });
});

describe("Profitshare adapter (XML)", () => {
  it("maps the sample feed", async () => {
    const evs = await collect("profitshare", "profitshare-sample.xml");
    expect(evs).toHaveLength(16);
    const o = offers(evs)[0]!;
    expect(o).toMatchObject({
      id: "EP-501",
      title: "Samsung Galaxy S24 5G 256 GB Negru",
      price: "3449,99",
      gtin: "8806095299914",
      mpn: "SM-S921BZKGEUE",
      brand: "SAMSUNG",
      category: ["Telefoane mobile"],
      affiliateUrl: "https://profitshare.ro/l/ep-501test",
      url: "https://electroplus-test.example.ro/ep-501.html",
      shippingCost: "0",
    });
    expect(o.description).toContain("<b>Samsung"); // CDATA kept as text
    const res = valid(evs, true);
    expect(res.every((r) => r.ok)).toBe(true);
    const first = res[0]!;
    expect(first.ok && first.offer.price).toBe(3449.99);
  });

  it("bad rows", async () => {
    const res = valid(await collect("profitshare", "profitshare-bad.xml"), true);
    expect(res.filter((r) => r.ok)).toHaveLength(2); // first + bad-EAN (warning)
  });

  it("rejects DOCTYPE / entity tricks", async () => {
    const xxe = `<?xml version="1.0"?><!DOCTYPE p [<!ENTITY x SYSTEM "file:///etc/passwd">]><products><product><product_name>&x;</product_name></product></products>`;
    const it = readOffers(getAdapter("profitshare"), Readable.from([xxe]));
    await expect(it.next()).rejects.toThrow();
  });
});

describe("direct adapters", () => {
  it("XML with specs", async () => {
    const evs = await collect("direct_xml", "direct-sample.xml");
    expect(evs).toHaveLength(11);
    const o = offers(evs)[0]!;
    expect(o.specs).toEqual({ Stocare: "256 GB", RAM: "8 GB" });
    expect(o.mpn).toBe("SM-S921BZKGEUE");
    const r = valid(evs, false);
    expect(r.every((x) => x.ok && x.offer.affiliateUrl === null)).toBe(true);
  });

  it("CSV with BOM, ';' delimiter, comma decimals and specs", async () => {
    const evs = await collect("direct_csv", "direct-sample.csv");
    expect(evs).toHaveLength(9);
    const o = offers(evs)[0]!;
    expect(o.id).toBe("CDP-1");
    expect(o.specs).toEqual({ Concentratie: "EDP" });
    const r = valid(evs, false);
    const p7 = r[6]!;
    expect(p7.ok && p7.offer.price).toBe(2279);
    expect(p7.ok && p7.offer.shippingCost).toBe(0);
  });

  it("bad files", async () => {
    expect(valid(await collect("direct_xml", "direct-bad.xml"), false).filter((r) => r.ok)).toHaveLength(2);
    expect(valid(await collect("direct_csv", "direct-bad.csv"), false).filter((r) => r.ok)).toHaveLength(2);
  });
});

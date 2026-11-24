import { describe, expect, it } from "vitest";
import { normalizeAvailability } from "./availability.js";
import { normalizeCategoryPath } from "./category.js";
import { isUsableMpn, normalizeGtin, normalizeMpn } from "./codes.js";
import { normalizeOffer } from "./offer.js";
import { parseCurrency, parsePrice, parseShipping } from "./price.js";
import { plainText, slugify } from "./text.js";

describe("parsePrice", () => {
  it.each([
    ["2.499,99 lei", 2499.99],
    ["2,499.99", 2499.99],
    ["2499.99", 2499.99],
    ["2499,99", 2499.99],
    ["3 999 RON", 3999],
    ["1.299", 1299],
    ["1.299,00", 1299],
    ["12.500", 12500],
    ["849.00", 849],
    ["19,9", 19.9],
    ["0.5", 0.5],
    ["1 234,50 lei", 1234.5],
  ])("%s -> %s", (raw, want) => expect(parsePrice(raw)).toBe(want));
  it.each(["", "abc", "pret la cerere", "-5", "0", "0,00", "1.2.3,4,5"])("%s -> null", (raw) => expect(parsePrice(raw)).toBeNull());
});

describe("currency and shipping", () => {
  it("detects currency", () => {
    expect(parseCurrency(undefined, "100 lei")).toBe("RON");
    expect(parseCurrency("eur", "100")).toBe("EUR");
    expect(parseCurrency(undefined, "1299,00 EUR")).toBe("EUR");
    expect(parseCurrency("RON", "1")).toBe("RON");
  });
  it("shipping null when absent, 0 when free", () => {
    expect(parseShipping(undefined)).toBeNull();
    expect(parseShipping("")).toBeNull();
    expect(parseShipping("0")).toBe(0);
    expect(parseShipping("Gratuit")).toBe(0);
    expect(parseShipping("19,99")).toBe(19.99);
    expect(parseShipping("necunoscut")).toBeNull();
  });
});

describe("GTIN", () => {
  it.each([
    ["5901234123457", "5901234123457"],
    ["590-1234-123457", "5901234123457"],
    ["96385074", "0000096385074"], // GTIN-8 padded
    ["036000291452", "0036000291452"], // UPC-A padded
    ["05901234123457", "5901234123457"], // GTIN-14 indicator 0
    ["15901234123454", "15901234123454"], // GTIN-14 kept
  ])("%s -> %s", (raw, want) => expect(normalizeGtin(raw)).toEqual({ gtin: want, invalid: false }));
  it.each(["5901234123458", "12345", "abcdefghijklm", "0000000000000"])("%s invalid", (raw) =>
    expect(normalizeGtin(raw)).toEqual({ gtin: null, invalid: true }),
  );
  it("empty is not invalid", () => expect(normalizeGtin("")).toEqual({ gtin: null, invalid: false }));
});

describe("MPN", () => {
  it("normalizes", () => {
    expect(normalizeMpn("sm-s921b zkg.eue")).toBe("SMS921BZKGEUE");
    expect(normalizeMpn("  ")).toBeNull();
  });
  it("usable only when long enough and not stoplisted", () => {
    const stop = ["N/A", "NA", "-", "DIVERSE"];
    expect(isUsableMpn("SMS921B", 4, stop)).toBe(true);
    expect(isUsableMpn("ABC", 4, stop)).toBe(false);
    expect(isUsableMpn("DIVERSE", 4, stop)).toBe(false);
    expect(isUsableMpn(null, 4, stop)).toBe(false);
  });
});

describe("availability", () => {
  it.each([
    ["in stock", "in_stock"],
    ["In Stoc", "in_stock"],
    ["în stoc", "in_stock"],
    ["1", "in_stock"],
    ["Stoc limitat", "limited"],
    ["Out Of Stock", "out_of_stock"],
    ["stoc epuizat", "out_of_stock"],
    ["0", "out_of_stock"],
    ["Backorder", "preorder"],
    ["precomandă", "preorder"],
    ["poate", "unknown"],
    [undefined, "unknown"],
  ])("%s -> %s", (raw, want) => expect(normalizeAvailability(raw)).toBe(want));
});

describe("text helpers", () => {
  it("category paths", () => {
    expect(normalizeCategoryPath(["Telefoane & Tablete", "Telefoane mobile"])).toBe("Telefoane & Tablete > Telefoane mobile");
    expect(normalizeCategoryPath(["Electronice»Telefoane |  Smartphone"])).toBe("Electronice > Telefoane > Smartphone");
    expect(normalizeCategoryPath([" ", undefined])).toBeNull();
  });
  it("slugify", () => {
    expect(slugify("Mașină de spălat rufe Bosch WAN28263BY, 8 kg")).toBe("masina-de-spalat-rufe-bosch-wan28263by-8-kg");
    expect(slugify("!!!")).toBe("produs");
    expect(slugify("a".repeat(50) + " " + "b".repeat(50)).length).toBeLessThanOrEqual(80);
  });
  it("plainText strips html", () => {
    expect(plainText("<p>Foarte <b>bun</b>&nbsp;&amp; ieftin</p>")).toBe("Foarte bun & ieftin");
  });
});

describe("normalizeOffer", () => {
  const base = {
    id: "A1",
    title: "Apple iPhone 15 128GB",
    price: "3.899,00 lei",
    oldPrice: "3.500,00",
    url: "https://shop.example.ro/p/a1",
    affiliateUrl: "https://event.2performant.com/x?y=1",
    gtin: "5901234123458",
    availability: "in stock",
  };
  it("normalizes and keeps the affiliate URL unchanged for affiliate merchants", () => {
    const r = normalizeOffer(base, { affiliate: true, allowedCurrencies: ["RON"] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.offer.price).toBe(3899);
    expect(r.offer.oldPrice).toBeNull(); // old price <= price dropped
    expect(r.offer.affiliateUrl).toBe(base.affiliateUrl);
    expect(r.offer.gtin).toBeNull();
    expect(r.offer.shippingCost).toBeNull();
    expect(r.warnings.map((w) => w.field)).toEqual(["gtin"]);
  });
  it("drops the affiliate URL for direct feeds and falls back to it as product URL only for affiliates", () => {
    const direct = normalizeOffer(base, { affiliate: false, allowedCurrencies: ["RON"] });
    expect(direct.ok && direct.offer.affiliateUrl).toBeNull();
    const onlyAff = normalizeOffer({ ...base, url: undefined }, { affiliate: true, allowedCurrencies: ["RON"] });
    expect(onlyAff.ok && onlyAff.offer.url).toBe(base.affiliateUrl);
  });
  it("rejects missing fields, bad prices, disallowed currencies; skips inactive", () => {
    const o = { affiliate: true, allowedCurrencies: ["RON"] };
    expect(normalizeOffer({ ...base, title: undefined }, o).ok).toBe(false);
    expect(normalizeOffer({ ...base, price: "la cerere" }, o).ok).toBe(false);
    expect(normalizeOffer({ ...base, url: "ftp://x", affiliateUrl: undefined }, o).ok).toBe(false);
    expect(normalizeOffer({ ...base, price: "100 EUR" }, o).ok).toBe(false);
    const inactive = normalizeOffer({ ...base, active: "0" }, o);
    expect(!inactive.ok && inactive.skip).toBe(true);
  });
});

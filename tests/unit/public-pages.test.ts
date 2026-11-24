import { describe, expect, it } from "vitest";
import { hasFilters, pageWindow, parseListingParams, toQueryString, toSearchArgs, PAGE_SIZE } from "@/lib/listing/params";
import { omnibusDisplay } from "@/lib/product/omnibus";
import { changePoints, chartGeometry, dailyMinSeries } from "@/lib/product/price-chart";
import { isBotUserAgent, normalizeSource, parseOfferId, safeDestination } from "@/lib/go/redirect";
import { parseCompareSlugs, toggleCompare, unionSpecKeys } from "@/lib/compare/slugs";
import { productImageUrl, specText } from "@/lib/storage";

describe("listing params", () => {
  it("parses filters, specs and page", () => {
    const p = parseListingParams({
      q: "  iphone 15 ",
      sort: "price_asc",
      pret_min: "1000,5",
      pret_max: "3000",
      brand: ["3", "7,9", "x"],
      magazin: "2",
      "spec_Memorie RAM": ["8 GB", "16 GB", "8 GB"],
      spec_: "ignored",
      pagina: "3",
    });
    expect(p).toEqual({
      q: "iphone 15",
      sort: "price_asc",
      priceMin: 1000.5,
      priceMax: 3000,
      brandIds: [3, 7, 9],
      merchantIds: [2],
      specs: { "Memorie RAM": ["8 GB", "16 GB"] },
      page: 3,
    });
    expect(hasFilters(p)).toBe(true);
  });

  it("drops invalid values and swaps an inverted price range", () => {
    const p = parseListingParams({ sort: "evil", pret_min: "500", pret_max: "100", pagina: "-2", brand: "1;drop" }, "offers");
    expect(p.sort).toBe("offers");
    expect([p.priceMin, p.priceMax]).toEqual([100, 500]);
    expect(p.page).toBe(1);
    expect(p.brandIds).toEqual([]);
    expect(hasFilters(parseListingParams({ q: "x" }))).toBe(false);
  });

  it("round-trips to a query string without defaults", () => {
    const p = parseListingParams({ q: "tv", brand: ["2", "1"], spec_Diagonala: "55 inch", pagina: "2" });
    const qs = toQueryString(p);
    expect(qs).toBe("?q=tv&brand=2&brand=1&spec_Diagonala=55+inch&pagina=2");
    expect(parseListingParams(Object.fromEntries(new URLSearchParams(qs).entries()))).toMatchObject({ q: "tv", page: 2 });
    expect(toQueryString(parseListingParams({}))).toBe("");
  });

  it("maps to RPC args with offset", () => {
    const args = toSearchArgs(parseListingParams({ pagina: "2" }), "a/b");
    expect(args).toMatchObject({ p_category_path: "a/b", p_offset: PAGE_SIZE, p_limit: PAGE_SIZE, p_query: undefined, p_specs: undefined });
  });

  it("builds a page window with gaps", () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(5, 10)).toEqual([1, null, 4, 5, 6, null, 10]);
    expect(pageWindow(2, 3)).toEqual([1, 2, 3]);
  });
});

describe("Omnibus display", () => {
  it("shows no reduction without old price or 30-day reference", () => {
    expect(omnibusDisplay({ price: 100, oldPrice: null, lowest30d: 90, historyDays: 30 }).kind).toBe("none");
    expect(omnibusDisplay({ price: 100, oldPrice: 120, lowest30d: null, historyDays: 30 }).kind).toBe("none");
    expect(omnibusDisplay({ price: 100, oldPrice: 100, lowest30d: 100, historyDays: 30 }).kind).toBe("none");
  });
  it("shows the full 30-day reference", () => {
    expect(omnibusDisplay({ price: 80, oldPrice: 100, lowest30d: 75, historyDays: 30 })).toEqual({
      kind: "reduction",
      oldPrice: 100,
      percent: 20,
      lowest: 75,
      days: 30,
      partial: false,
    });
  });
  it("marks a partial history with the tracked days (at least 1)", () => {
    expect(omnibusDisplay({ price: 80, oldPrice: 100, lowest30d: 80, historyDays: 12 })).toMatchObject({ days: 12, partial: true });
    expect(omnibusDisplay({ price: 80, oldPrice: 100, lowest30d: 80, historyDays: 0 })).toMatchObject({ days: 1, partial: true });
  });
});

describe("price chart", () => {
  const now = new Date("2026-11-25T12:00:00Z");
  it("carries prices forward and takes the daily minimum across offers", () => {
    const s = dailyMinSeries(
      [
        { offer_id: 1, price: 100, recorded_at: "2026-11-20T08:00:00Z" },
        { offer_id: 2, price: 95, recorded_at: "2026-11-22T08:00:00Z" },
        { offer_id: 1, price: 90, recorded_at: "2026-11-24T08:00:00Z" },
      ],
      { now, days: 7, activeOfferIds: [1, 2] },
    );
    expect(s).toEqual([
      { date: "2026-11-20", min: 100 },
      { date: "2026-11-21", min: 100 },
      { date: "2026-11-22", min: 95 },
      { date: "2026-11-23", min: 95 },
      { date: "2026-11-24", min: 90 },
      { date: "2026-11-25", min: 90 },
    ]);
    expect(changePoints(s).map((p) => p.date)).toEqual(["2026-11-20", "2026-11-22", "2026-11-24", "2026-11-25"]);
  });
  it("stops expired offers after their last record and uses current prices today", () => {
    const s = dailyMinSeries([{ offer_id: 9, price: 50, recorded_at: "2026-11-23T08:00:00Z" }], {
      now,
      days: 4,
      activeOfferIds: [1],
      current: new Map([[1, 70]]),
    });
    expect(s).toEqual([
      { date: "2026-11-23", min: 50 },
      { date: "2026-11-25", min: 70 },
    ]);
  });
  it("builds an SVG step path", () => {
    expect(chartGeometry([], 100, 50)).toBeNull();
    const g = chartGeometry(
      [
        { date: "a", min: 10 },
        { date: "b", min: 20 },
      ],
      100,
      50,
      0,
    )!;
    expect(g.path).toBe("M0 50 H100 V0");
    expect([g.low, g.high]).toEqual([10, 20]);
    expect(chartGeometry([{ date: "a", min: 5 }], 100, 50, 8)!.path).toBe("M8 25 H92");
  });
});

describe("/go helpers", () => {
  it("validates offer ids", () => {
    expect(parseOfferId("123")).toBe(123);
    for (const bad of ["0", "-1", "1e3", "12a", "", "99999999999999999"]) expect(parseOfferId(bad)).toBeNull();
  });
  it("whitelists sources", () => {
    expect(normalizeSource(null)).toBe("product");
    expect(normalizeSource("compare")).toBe("compare");
    expect(normalizeSource("x")).toBe("other");
  });
  it("detects bots", () => {
    expect(isBotUserAgent("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBe(true);
    expect(isBotUserAgent("curl/8.4.0")).toBe(true);
    expect(isBotUserAgent("")).toBe(true);
    expect(isBotUserAgent("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36")).toBe(false);
  });
  it("only allows http(s) destinations", () => {
    expect(safeDestination("https://shop.ro/p?id=1&aff=x")).toBe("https://shop.ro/p?id=1&aff=x");
    expect(safeDestination("http://shop.ro/")).toBe("http://shop.ro/");
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "//evil.com", "/local", "ftp://x.ro", "https://u:p@x.ro/", null]) {
      expect(safeDestination(bad)).toBeNull();
    }
  });
});

describe("compare + storage helpers", () => {
  it("parses compare slugs", () => {
    expect(parseCompareSlugs("a-1,B-2,a-1,bad slug,c,d,e")).toEqual(["a-1", "b-2", "c", "d"]);
    expect(parseCompareSlugs(undefined)).toEqual([]);
  });
  it("toggles with a max of 4", () => {
    expect(toggleCompare(["a"], "a")).toEqual({ list: [], full: false });
    expect(toggleCompare(["a", "b", "c", "d"], "e")).toEqual({ list: ["a", "b", "c", "d"], full: true });
    expect(unionSpecKeys([{ x: 1, y: 2 }, { y: 3, z: 4 }])).toEqual(["x", "y", "z"]);
  });
  it("builds storage URLs and spec text", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://api.example.ro/";
    expect(productImageUrl("ab/c d.webp")).toBe("https://api.example.ro/storage/v1/object/public/product-images/ab/c%20d.webp");
    expect(productImageUrl("https://shop.ro/x.jpg")).toBeNull();
    expect(productImageUrl(null)).toBeNull();
    expect(specText(["a", 2, true])).toBe("a, 2, true");
  });
});

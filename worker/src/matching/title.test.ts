import { describe, expect, it } from "vitest";
import { decide, normalizeForMatch, scoreTitles } from "./title.js";

const T = { matchAuto: 0.85, matchReview: 0.55 };

// [offer title, candidate product title, expected decision]
const cases: Array<[string, string, "auto" | "review" | "new" | "not-auto"]> = [
  ["Telefon mobil Samsung Galaxy S24, 256GB, 8GB RAM, Dual SIM, Onyx Black", "Samsung Galaxy S24 5G 256 GB Negru", "auto"],
  ["Telefon mobil Apple iPhone 15, 128GB, Black", "Apple iPhone 15 128GB Negru", "auto"],
  ["Chanel Coco Mademoiselle Eau de Parfum 100 ml", "Chanel Coco Mademoiselle Apa de Parfum pentru femei 100ml", "auto"],
  ["Samsung UE55CU7172UXXH 55\" 4K Smart TV", "Samsung UE55CU7172 55 inch 4K Smart TV", "auto"],
  ["Apple iPhone 15 128GB", "Apple iPhone 15 Pro 128GB", "not-auto"],
  ["Apple iPhone 15 128GB", "Apple iPhone 14 128GB", "not-auto"],
  ["Samsung Galaxy S24 256GB", "Samsung Galaxy S24 Ultra 256GB", "not-auto"],
  ["Samsung Galaxy S24 128GB", "Samsung Galaxy S24 256GB", "not-auto"],
  ["SSD Samsung 990 PRO 1TB NVMe", "SSD Samsung 990 PRO 2TB NVMe", "not-auto"],
  ["SSD Samsung 990 PRO 1TB NVMe", "SSD Samsung 990 PRO 1000GB NVMe", "auto"],
  ["Dior J'adore Eau de Parfum 50 ml", "Dior J'adore Eau de Parfum 100 ml", "not-auto"],
  ["Chanel Coco Mademoiselle Eau de Toilette 100 ml", "Chanel Coco Mademoiselle Eau de Parfum 100 ml", "not-auto"],
  ["Laptop ASUS 8GB RAM 512GB", "Laptop ASUS 16GB RAM 512GB", "not-auto"],
  ["Masina de spalat rufe Bosch WAN28263BY 8 kg", "Masina de spalat rufe Bosch WAN28264BY 8 kg", "not-auto"],
  ["Televizor LG 55UR78003LK 139 cm", "Masina de spalat Beko WTV8636XS 8 kg", "new"],
];

describe("title matching (table)", () => {
  it.each(cases)("%s  vs  %s -> %s", (a, b, want) => {
    const s = scoreTitles(a, b);
    const d = decide(s, T);
    if (want === "not-auto") expect(d).not.toBe("auto");
    else expect(d).toBe(want);
  });

  it("1TB vs 2TB is never auto, even with a threshold of 0", () => {
    const s = scoreTitles("Samsung 990 PRO 1TB", "Samsung 990 PRO 2TB");
    expect(s.guard).toBe(false);
    expect(decide(s, { matchAuto: 0, matchReview: 0 })).not.toBe("auto");
  });

  it("iPhone 15 vs iPhone 15 Pro lands in review, not auto", () => {
    const s = scoreTitles("Apple iPhone 15 128GB Black", "Apple iPhone 15 Pro 128GB Black");
    expect(s.guard).toBe(false);
    expect(decide(s, T)).toBe("review");
  });

  it("normalizes units, RAM, colors and noise", () => {
    const n = normalizeForMatch("Telefon mobil Samsung Galaxy S24+, 1 TB, 12GB RAM, Dual SIM, Onyx Black");
    expect(n.text).toBe("samsung galaxy s24 plus 1000gb");
    expect(n.ram).toBe("12gb");
    expect(n.variants.has("plus")).toBe(true);
    expect(normalizeForMatch("Parfum 1,5 l").text).toContain("1500ml");
    expect(normalizeForMatch('TV 55" 4K').text).toContain("55in");
  });
});

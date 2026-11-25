import { describe, expect, it } from "vitest";
import { dropPercent, formatDate, formatPrice } from "@/lib/format";

// Intl uses narrow no-break spaces in some locales; normalize them for stable assertions.
const norm = (s: string) => s.replace(/[  ]/g, " ");

describe("formatPrice", () => {
  it("formats lei in Romanian (lei, not RON)", () => {
    expect(norm(formatPrice(2499.99, "ro"))).toBe("2.499,99 lei");
  });
  it("formats lei in English", () => {
    expect(norm(formatPrice(2499.99, "en"))).toBe("RON 2,499.99");
  });
});

describe("formatDate", () => {
  it("uses the Bucharest time zone", () => {
    // 23:30 UTC on Nov 24 is already Nov 25 in Bucharest (UTC+2).
    expect(formatDate("2026-11-24T23:30:00Z", "ro")).toBe("25.11.2026");
  });
});

describe("dropPercent", () => {
  it("rounds down real drops and ignores increases", () => {
    expect(dropPercent(100, 79.5)).toBe(20);
    expect(dropPercent(100, 120)).toBe(0);
    expect(dropPercent(0, 10)).toBe(0);
  });
});

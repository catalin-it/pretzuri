import { describe, expect, it } from "vitest";
import pkg from "../../../package.json";
import { CHANGELOG } from "./entries";

const parse = (v: string) => v.split(".").map(Number);

function compare(a: string, b: string): number {
  const [pa, pb] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

describe("changelog entries", () => {
  it("has plain semver versions and ISO dates", () => {
    for (const e of CHANGELOG) {
      expect(e.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(e.date))).toBe(false);
    }
  });

  it("has non-empty en and ro lists of equal length", () => {
    for (const e of CHANGELOG) {
      expect(e.items.en.length).toBeGreaterThan(0);
      expect(e.items.ro.length).toBe(e.items.en.length);
      for (const s of [...e.items.en, ...e.items.ro]) expect(s.trim().length).toBeGreaterThan(0);
    }
  });

  it("is strictly descending by version, with non-increasing dates", () => {
    for (let i = 1; i < CHANGELOG.length; i++) {
      expect(compare(CHANGELOG[i - 1].version, CHANGELOG[i].version)).toBeGreaterThan(0);
      expect(CHANGELOG[i - 1].date >= CHANGELOG[i].date).toBe(true);
    }
  });

  it("starts with the package.json version", () => {
    expect(CHANGELOG[0].version).toBe(pkg.version);
  });
});

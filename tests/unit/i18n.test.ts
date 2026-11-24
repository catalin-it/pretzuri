import { describe, expect, it } from "vitest";
import ro from "../../messages/ro.json";
import en from "../../messages/en.json";

function keys(obj: unknown, prefix = ""): string[] {
  if (typeof obj !== "object" || obj === null) return [prefix];
  return Object.entries(obj).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

describe("messages", () => {
  it("ro and en have exactly the same keys", () => {
    expect(keys(en).sort()).toEqual(keys(ro).sort());
  });
  it("has no empty strings", () => {
    for (const msgs of [ro, en]) {
      for (const k of keys(msgs)) {
        const v = k.split(".").reduce<unknown>((o, p) => (o as Record<string, unknown>)[p], msgs);
        expect(String(v).trim().length, k).toBeGreaterThan(0);
      }
    }
  });
});

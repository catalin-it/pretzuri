import { describe, expect, it } from "vitest";
import { buildCsp, buildStaticCsp } from "@/lib/security/csp";
import { offlineUrlFor, shouldBypassCache } from "@/lib/pwa/cache-rules";

describe("CSP", () => {
  it("uses a nonce and strict-dynamic, no unsafe-inline scripts", () => {
    const csp = buildCsp({ nonce: "abc", supabaseUrl: "https://api-dev-pretzuri.it-ist.ro" });
    expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(csp).toContain("connect-src 'self' https://api-dev-pretzuri.it-ist.ro wss://api-dev-pretzuri.it-ist.ro");
    expect(csp).toContain("frame-ancestors 'none'");
  });
  it("ignores an invalid Supabase URL", () => {
    expect(buildStaticCsp("javascript:alert(1)")).toContain("connect-src 'self';");
  });
});

describe("service worker cache rules", () => {
  const origin = "https://dev-pretzuri.it-ist.ro";
  it("never caches API, auth or token URLs", () => {
    expect(shouldBypassCache({ url: `${origin}/api/health`, origin })).toBe(true);
    expect(shouldBypassCache({ url: `${origin}/ro/p/x?token=1`, origin })).toBe(true);
    expect(shouldBypassCache({ url: `${origin}/icons/icon-192.png`, origin, hasAuthorization: true })).toBe(true);
  });
  it("picks the offline page of the URL locale, default ro", () => {
    expect(offlineUrlFor("/en/p/abc", ["ro", "en"], "ro")).toBe("/en/offline");
    expect(offlineUrlFor("/xx", ["ro", "en"], "ro")).toBe("/ro/offline");
  });
});

import { describe, expect, it } from "vitest";
import { flashForDbError, isFlashCode, safeAdminBack, withFlash } from "@/lib/admin/feedback";
import {
  decideReportSchema,
  feedSourceSchema,
  merchantSchema,
  moderateReviewSchema,
  parseIdList,
  parseSetting,
  parseSettingsForm,
  settingToInput,
} from "@/lib/admin/schemas";
import { formatBytes } from "@/lib/admin/format";

describe("safeAdminBack", () => {
  it.each([
    ["/ro/admin", "ro", "/ro/admin"],
    ["/ro/admin/merchants/12", "ro", "/ro/admin/merchants/12"],
    ["/en/admin/categories?merchant=3&show=all", "en", "/en/admin/categories?merchant=3&show=all"],
    ["https://evil.example/ro/admin", "ro", "/ro/admin"],
    ["//evil.example", "ro", "/ro/admin"],
    ["/ro/admin//evil", "ro", "/ro/admin"],
    ["/ro/cont", "ro", "/ro/admin"],
    ["/en/admin", "ro", "/ro/admin"],
    ["/ro/admin/x?a=<script>", "ro", "/ro/admin"],
    [undefined, "en", "/en/admin"],
    ["/ro/admin", "xx", "/ro/admin"],
  ])("%s (%s) -> %s", (back, locale, expected) => {
    expect(safeAdminBack(back, locale)).toBe(expected);
  });
});

describe("withFlash", () => {
  it("adds the code and replaces an earlier one", () => {
    expect(withFlash("/ro/admin/users", "ok", "saved")).toBe("/ro/admin/users?ok=saved");
    expect(withFlash("/ro/admin/users?q=a&err=invalid", "ok", "roleChanged")).toBe("/ro/admin/users?q=a&ok=roleChanged");
  });
  it("maps database error codes", () => {
    expect(flashForDbError("42501")).toBe("denied");
    expect(flashForDbError("22023")).toBe("invalid");
    expect(flashForDbError("P0001")).toBe("refused");
    expect(flashForDbError("P0002")).toBe("notFound");
    expect(flashForDbError("23505")).toBe("duplicate");
    expect(flashForDbError(undefined)).toBe("failed");
    expect(isFlashCode("saved")).toBe(true);
    expect(isFlashCode("<b>")).toBe(false);
  });
});

describe("parseIdList", () => {
  it("dedupes, ignores junk and caps at 500", () => {
    expect(parseIdList(["3", "1", "3", "x", "-2", "0"])).toEqual([3, 1]);
    expect(parseIdList("4, 5 6")).toEqual([4, 5, 6]);
    expect(parseIdList(null)).toEqual([]);
    expect(parseIdList(Array.from({ length: 600 }, (_, i) => String(i + 1)))).toHaveLength(500);
  });
});

describe("merchantSchema", () => {
  const base = { slug: "emag", name: "eMAG", website: "https://www.emag.ro", has_affiliate: "on", affiliate_network: "2performant", is_active: "on" };
  it("accepts a valid affiliate merchant", () => {
    const r = merchantSchema.parse(base);
    expect(r).toMatchObject({ has_affiliate: true, affiliate_network: "2performant", is_active: true, description: null });
  });
  it("requires a network for affiliate merchants and a valid slug/url", () => {
    expect(merchantSchema.safeParse({ ...base, affiliate_network: "" }).success).toBe(false);
    expect(merchantSchema.safeParse({ ...base, slug: "Bad Slug" }).success).toBe(false);
    expect(merchantSchema.safeParse({ ...base, website: "javascript:alert(1)" }).success).toBe(false);
    expect(merchantSchema.parse({ ...base, has_affiliate: undefined, affiliate_network: "" })).toMatchObject({ has_affiliate: false, affiliate_network: null });
  });
});

describe("feedSourceSchema", () => {
  const base = { name: "Feed", type: "direct_csv", url: "https://shop.example/feed.csv?token=x", options: "", schedule_minutes: "360", is_active: "on" };
  it("parses options JSON and bounds the schedule", () => {
    expect(feedSourceSchema.parse(base).options).toEqual({});
    expect(feedSourceSchema.parse({ ...base, options: '{"delimiter":";"}' }).options).toEqual({ delimiter: ";" });
    expect(feedSourceSchema.safeParse({ ...base, options: "[1]" }).success).toBe(false);
    expect(feedSourceSchema.safeParse({ ...base, options: "{bad" }).success).toBe(false);
    expect(feedSourceSchema.safeParse({ ...base, schedule_minutes: "5" }).success).toBe(false);
    expect(feedSourceSchema.safeParse({ ...base, type: "scraper" }).success).toBe(false);
    expect(feedSourceSchema.safeParse({ ...base, url: "file:///etc/passwd" }).success).toBe(false);
  });
});

describe("moderation schemas", () => {
  it("needs a statement of reasons to reject or remove", () => {
    expect(moderateReviewSchema.safeParse({ review_id: "1", action: "approve" }).success).toBe(true);
    expect(moderateReviewSchema.safeParse({ review_id: "1", action: "reject", reason: "scurt" }).success).toBe(false);
    expect(moderateReviewSchema.safeParse({ review_id: "1", action: "reject", reason: "Conține date personale ale unui angajat." }).success).toBe(true);
  });
  it("removing a review only with an actioned notice", () => {
    const ok = { report_id: "2", decision: "actioned", reason: "Recenzie publicitară (spam).", remove_review: "on" };
    expect(decideReportSchema.parse(ok).remove_review).toBe(true);
    expect(decideReportSchema.safeParse({ ...ok, decision: "dismissed" }).success).toBe(false);
    expect(decideReportSchema.safeParse({ ...ok, remove_review: undefined, decision: "dismissed" }).success).toBe(true);
  });
});

describe("settings", () => {
  it("parses numbers (decimal comma too), ints and lists within bounds", () => {
    expect(parseSetting("match_auto", "0,9")).toBe(0.9);
    expect(parseSetting("match_auto", "1.5")).toBeNull();
    expect(parseSetting("mpn_min_length", "4.5")).toBeNull();
    expect(parseSetting("offer_stale_hours", "48")).toBe(48);
    expect(parseSetting("allowed_currencies", "RON\nEUR, RON")).toEqual(["RON", "EUR"]);
    expect(parseSetting("allowed_currencies", "")).toBeNull();
    expect(parseSetting("allowed_currencies", "lei")).toBeNull();
    expect(parseSetting("mpn_stoplist", "")).toEqual([]);
  });
  it("requires review < auto", () => {
    expect(parseSettingsForm({ match_auto: "0.8", match_review: "0.85" }).errors).toContain("match_order");
    const ok = parseSettingsForm({ match_auto: "0.9", match_review: "0.6", mpn_stoplist: "N/A\nNA" });
    expect(ok.errors).toEqual([]);
    expect(ok.values).toEqual({ match_auto: 0.9, match_review: 0.6, mpn_stoplist: ["N/A", "NA"] });
  });
  it("renders form values", () => {
    expect(settingToInput("mpn_stoplist", ["N/A", "-"])).toBe("N/A\n-");
    expect(settingToInput("match_auto", 0.85)).toBe("0.85");
  });
  it("formats bytes", () => {
    expect(formatBytes(2147483648, "en")).toBe("2 GB");
  });
});

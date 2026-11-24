import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { HostGate } from "./gate.js";
import { fetchImage, fixtureImageFile, sniffImageFormat } from "./source.js";
import { makeThumbnail, sharpOptions, thumbnailPath } from "./thumbnail.js";
import type { Config } from "../config.js";

const fixturesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../fixtures");
const on = { allowFixtures: true, fixturesDir };

describe("fixture image URL mapping", () => {
  it("maps fixtures.invalid/img/<name> to fixtures/images/<name> only when fixtures are allowed", () => {
    expect(fixtureImageFile("https://fixtures.invalid/img/sample-blue.jpg", on)).toBe(path.join(fixturesDir, "images", "sample-blue.jpg"));
    expect(fixtureImageFile("https://fixtures.invalid/img/sample-blue.jpg", { ...on, allowFixtures: false })).toBeNull();
  });
  it("rejects traversal and other shapes", () => {
    for (const u of [
      "https://fixtures.invalid/img/../x.jpg",
      "https://fixtures.invalid/img/a/b.jpg",
      "https://fixtures.invalid/img/%2e%2e/x",
      "https://fixtures.invalid/other/a.jpg",
      "https://shop.example.com/img/a.jpg",
      "not a url",
    ]) expect(fixtureImageFile(u, on), u).toBeNull();
  });
  it("gives DEV test merchants a deterministic sample image", () => {
    const a = fixtureImageFile("https://megashop-test.example.ro/img/MS1001.jpg", on);
    expect(a).toMatch(/sample-/);
    expect(fixtureImageFile("https://megashop-test.example.ro/img/MS1001.jpg", on)).toBe(a);
    expect(fixtureImageFile("https://megashop-test.example.ro/img/MS1001.jpg", { ...on, allowFixtures: false })).toBeNull();
  });
});

describe("image validation", () => {
  it("sniffs real formats and rejects the rest", async () => {
    const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: "#fff" } }).png().toBuffer();
    expect(sniffImageFormat(png)).toBe("png");
    expect(sniffImageFormat(fs.readFileSync(path.join(fixturesDir, "images/sample-blue.jpg")))).toBe("jpeg");
    expect(sniffImageFormat(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(sniffImageFormat(Buffer.from("<html>404</html>"))).toBeNull();
    expect(sniffImageFormat(Buffer.alloc(0))).toBeNull();
  });
  it("refuses non-images before decoding", async () => {
    await expect(makeThumbnail(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"), { maxPx: 600, quality: 78 })).rejects.toThrow(/not a supported image/);
  });
  it("fetchImage enforces the size limit on fixture files", async () => {
    const cfg = { ...on, downloadTimeoutMs: 10_000, allowPrivateHosts: false } as Config;
    await expect(fetchImage("https://fixtures.invalid/img/sample-blue.jpg", cfg, 100)).rejects.toThrow(/larger than/);
    expect((await fetchImage("https://fixtures.invalid/img/sample-blue.jpg", cfg, 1_000_000)).length).toBeGreaterThan(1000);
  });
  it("fetchImage rejects non-http(s) and private addresses (SSRF guard)", async () => {
    const cfg = { allowFixtures: false, fixturesDir, downloadTimeoutMs: 10_000, allowPrivateHosts: false } as Config;
    await expect(fetchImage("file:///etc/passwd", cfg, 1000)).rejects.toThrow();
    await expect(fetchImage("http://169.254.169.254/latest/meta-data", cfg, 1000)).rejects.toThrow(/private/);
  });
});

describe("thumbnail", () => {
  it("clamps options", () => {
    expect(sharpOptions({ maxPx: 600, quality: 78 })).toMatchObject({
      resize: { width: 600, height: 600, fit: "inside", withoutEnlargement: true },
      webp: { quality: 78 },
    });
    expect(sharpOptions({ maxPx: 99999, quality: 500 }).resize.width).toBe(4096);
    expect(sharpOptions({ maxPx: 1, quality: 0 }).webp.quality).toBe(1);
  });
  it("makes a WebP that fits in 600x600, without metadata, never enlarged", async () => {
    const src = fs.readFileSync(path.join(fixturesDir, "images/sample-blue.jpg")); // 800x700
    const t = await makeThumbnail(src, { maxPx: 600, quality: 78 });
    const meta = await sharp(t.data).metadata();
    expect(meta.format).toBe("webp");
    expect(Math.max(meta.width!, meta.height!)).toBe(600);
    expect(meta.width).toBe(t.width);
    expect(meta.exif).toBeUndefined();
    expect(meta.icc).toBeUndefined();
    expect(t.hash).toMatch(/^[0-9a-f]{16}$/);
    const small = await sharp({ create: { width: 50, height: 40, channels: 3, background: "#f00" } }).jpeg().toBuffer();
    const s = await makeThumbnail(small, { maxPx: 600, quality: 78 });
    expect([s.width, s.height]).toEqual([50, 40]);
  });
  it("drops EXIF from the source", async () => {
    const withExif = await sharp({ create: { width: 30, height: 30, channels: 3, background: "#0f0" } })
      .jpeg().withExif({ IFD0: { Copyright: "secret-owner" } }).toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeDefined();
    const t = await makeThumbnail(withExif, { maxPx: 600, quality: 78 });
    expect((await sharp(t.data).metadata()).exif).toBeUndefined();
    expect(t.data.includes(Buffer.from("secret-owner"))).toBe(false);
  });
  it("builds the object path used by the frontend", () => {
    expect(thumbnailPath(42, "abcd")).toBe("p/42/abcd.webp");
  });
});

describe("HostGate", () => {
  it("limits parallelism per host and spaces starts", async () => {
    let active = 0;
    let peak = 0;
    const starts: number[] = [];
    let t = 0;
    const gate = new HostGate(2, 100, () => t, async (ms) => { t += ms; });
    const job = async () => {
      starts.push(t);
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
    };
    await Promise.all([1, 2, 3, 4, 5].map(() => gate.run("a.example", job)));
    expect(peak).toBeLessThanOrEqual(2);
    expect(starts.slice(1).every((x, i) => x >= starts[i]!)).toBe(true);
    expect(Math.max(...starts)).toBeGreaterThanOrEqual(400);
  });
});

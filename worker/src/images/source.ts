import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { download } from "../download/download.js";
import type { Config } from "../config.js";

/** Formats accepted from shops. SVG is never accepted (scripts); TIFF/HEIC are rare and not worth the attack surface. */
export const ACCEPTED_FORMATS = ["jpeg", "png", "webp", "gif"] as const;

/** Sniffs the real type from the magic bytes (the Content-Type header and the extension are not trusted). */
export function sniffImageFormat(b: Buffer): (typeof ACCEPTED_FORMATS)[number] | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (b.length >= 6 && (b.subarray(0, 6).toString("latin1") === "GIF87a" || b.subarray(0, 6).toString("latin1") === "GIF89a")) return "gif";
  if (b.length >= 12 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
  return null;
}

/**
 * DEV/tests only (WORKER_ALLOW_FIXTURES=1): `https://fixtures.invalid/img/<name>` is served from
 * `<fixturesDir>/images/<name>`. Offers of the `*-test.example.ro` DEV merchants get one of the bundled sample
 * images, picked by a hash of the URL, so the whole DEV catalog shows real thumbnails without any network access.
 */
export function fixtureImageFile(url: string, config: Pick<Config, "allowFixtures" | "fixturesDir">): string | null {
  if (!config.allowFixtures) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const dir = path.join(config.fixturesDir, "images");
  if (u.hostname === "fixtures.invalid") {
    const m = /^\/img\/([A-Za-z0-9][A-Za-z0-9._-]*)$/.exec(u.pathname);
    if (!m || m[1]!.includes("..")) return null;
    return path.join(dir, m[1]!);
  }
  if (u.hostname.endsWith("-test.example.ro")) {
    let names: string[];
    try {
      names = fs.readdirSync(dir).filter((n) => /^sample-[A-Za-z0-9._-]+\.(png|jpg)$/.test(n)).sort();
    } catch {
      return null;
    }
    if (!names.length) return null;
    const h = crypto.createHash("sha256").update(url).digest().readUInt32BE(0);
    return path.join(dir, names[h % names.length]!);
  }
  return null;
}

async function readLimited(stream: AsyncIterable<Buffer | string>, max: number): Promise<Buffer> {
  const parts: Buffer[] = [];
  let n = 0;
  for await (const chunk of stream) {
    const b = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    n += b.length;
    if (n > max) throw new Error(`image larger than ${max} bytes`);
    parts.push(b);
  }
  return Buffer.concat(parts, n);
}

/** Fetches one shop image: http(s) only, SSRF guard on every hop, size limit; fixtures only in DEV. */
export async function fetchImage(url: string, config: Config, maxBytes: number): Promise<Buffer> {
  const fx = fixtureImageFile(url, config);
  if (fx) {
    const st = await fs.promises.stat(fx);
    if (st.size > maxBytes) throw new Error(`image larger than ${maxBytes} bytes`);
    return fs.promises.readFile(fx);
  }
  if (!/^https?:\/\//i.test(url)) throw new Error("image URL is not http(s)");
  const res = await download(url, {
    maxBytes,
    timeoutMs: Math.min(config.downloadTimeoutMs, 20_000),
    allowFixtures: false,
    fixturesDir: config.fixturesDir,
    allowPrivateHosts: config.allowPrivateHosts,
  });
  if (res.notModified) throw new Error("unexpected 304");
  return readLimited(res.body, maxBytes);
}

import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import path from "node:path";
import { PassThrough, Transform, type Readable } from "node:stream";
import zlib from "node:zlib";
import { guardedLookup, isBlockedIp } from "./ssrf.js";

export interface DownloadOptions {
  etag?: string | null;
  lastModified?: string | null;
  maxBytes: number;
  timeoutMs: number;
  allowFixtures: boolean;
  fixturesDir: string;
  /** Tests only. */
  allowPrivateHosts?: boolean;
}

export type DownloadResult =
  | { notModified: true }
  | { notModified: false; body: Readable; etag: string | null; lastModified: string | null };

const MAX_REDIRECTS = 5;
const USER_AGENT = "PretzuriFeedWorker/0.1";

/** `fixture:<name>` or `https://fixtures.invalid/<name>` (the .invalid TLD never resolves). */
export function fixtureName(url: string): string | null {
  let name: string | null = null;
  if (url.startsWith("fixture:")) name = url.slice("fixture:".length);
  else {
    try {
      const u = new URL(url);
      if (u.hostname === "fixtures.invalid") name = u.pathname.replace(/^\/+/, "");
    } catch {
      return null;
    }
  }
  if (name === null) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) || name.includes("..")) throw new Error("invalid fixture name");
  return name;
}

/** Counts decompressed bytes and fails the stream above the limit. */
function byteLimit(max: number): Transform {
  let n = 0;
  return new Transform({
    transform(chunk: Buffer, _enc, cb) {
      n += chunk.length;
      if (n > max) cb(new Error(`feed larger than feed_max_bytes (${max} bytes)`));
      else cb(null, chunk);
    },
  });
}

/** gunzip when declared (Content-Encoding, .gz) or when the body starts with the gzip magic bytes. */
function maybeGunzip(src: Readable, declared: boolean): Readable {
  const out = new PassThrough();
  let decided = false;
  const fail = (e: Error) => out.destroy(e);
  src.once("error", fail);
  const decide = (first: Buffer | null) => {
    decided = true;
    const gz = declared || (first !== null && first.length >= 2 && first[0] === 0x1f && first[1] === 0x8b);
    if (first) src.unshift(first);
    if (gz) {
      const z = zlib.createGunzip();
      z.once("error", fail);
      src.pipe(z).pipe(out);
    } else src.pipe(out);
  };
  src.once("readable", () => {
    if (decided) return;
    decide(src.read() as Buffer | null);
  });
  src.once("end", () => {
    if (!decided) {
      decided = true;
      out.end();
    }
  });
  return out;
}

function finish(raw: Readable, gz: boolean, maxBytes: number): Readable {
  const limited = byteLimit(maxBytes);
  const unz = maybeGunzip(raw, gz);
  unz.once("error", (e) => limited.destroy(e));
  return unz.pipe(limited);
}

async function fromFixture(name: string, opts: DownloadOptions): Promise<DownloadResult> {
  if (!opts.allowFixtures) throw new Error("fixture feeds are disabled (WORKER_ALLOW_FIXTURES != 1)");
  const file = path.join(opts.fixturesDir, name);
  const st = await fs.promises.stat(file);
  const etag = `W/"${st.size}-${Math.floor(st.mtimeMs)}"`;
  if (opts.etag && opts.etag === etag) return { notModified: true };
  return {
    notModified: false,
    body: finish(fs.createReadStream(file), name.endsWith(".gz"), opts.maxBytes),
    etag,
    lastModified: st.mtime.toUTCString(),
  };
}

/**
 * Streams a feed: http(s) only, SSRF guard on every hop (literal IPs and DNS answers), redirects (max 5),
 * idle timeout, conditional GET (ETag / If-Modified-Since -> 304 = not modified), gzip, size limit.
 */
export async function download(url: string, opts: DownloadOptions): Promise<DownloadResult> {
  const fx = fixtureName(url);
  if (fx !== null) return fromFixture(fx, opts);

  let current = new URL(url);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (current.protocol !== "http:" && current.protocol !== "https:") throw new Error(`unsupported protocol ${current.protocol}`);
    const host = current.hostname.replace(/^\[|\]$/g, "");
    if (!opts.allowPrivateHosts && net.isIP(host) && isBlockedIp(host)) {
      throw new Error("refusing to download from a private/reserved address");
    }
    const res = await request(current, opts);
    const status = res.statusCode ?? 0;
    if (status >= 300 && status < 400 && status !== 304) {
      res.resume();
      const loc = res.headers.location;
      if (!loc) throw new Error(`HTTP ${status} without Location`);
      current = new URL(loc, current);
      continue;
    }
    if (status === 304) {
      res.resume();
      return { notModified: true };
    }
    if (status !== 200) {
      res.resume();
      throw new Error(`HTTP ${status}`);
    }
    const declaredLen = Number(res.headers["content-length"] ?? 0);
    const enc = String(res.headers["content-encoding"] ?? "").toLowerCase();
    if (enc && enc !== "gzip" && enc !== "identity" && enc !== "x-gzip") {
      res.resume();
      throw new Error(`unsupported content-encoding ${enc}`);
    }
    if (!enc && declaredLen > opts.maxBytes) {
      res.resume();
      throw new Error(`feed larger than feed_max_bytes (${declaredLen} bytes)`);
    }
    const gz = enc === "gzip" || enc === "x-gzip" || current.pathname.endsWith(".gz");
    return {
      notModified: false,
      body: finish(res, gz, opts.maxBytes),
      etag: typeof res.headers.etag === "string" ? res.headers.etag : null,
      lastModified: typeof res.headers["last-modified"] === "string" ? res.headers["last-modified"] : null,
    };
  }
  throw new Error("too many redirects");
}

function request(u: URL, opts: DownloadOptions): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { "user-agent": USER_AGENT, "accept-encoding": "gzip", accept: "*/*" };
    if (opts.etag) headers["if-none-match"] = opts.etag;
    if (opts.lastModified) headers["if-modified-since"] = opts.lastModified;
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(
      u,
      {
        method: "GET",
        headers,
        lookup: opts.allowPrivateHosts ? undefined : (guardedLookup as unknown as net.LookupFunction),
        timeout: opts.timeoutMs,
      },
      (res) => {
        // Idle timeout while streaming the body.
        res.socket.setTimeout(opts.timeoutMs, () => res.destroy(new Error("download idle timeout")));
        resolve(res);
      },
    );
    req.on("timeout", () => req.destroy(new Error("download timeout")));
    req.on("error", reject);
    req.end();
  });
}

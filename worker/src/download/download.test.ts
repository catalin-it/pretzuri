import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import type { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { download, fixtureName, type DownloadOptions } from "./download.js";
import { isBlockedIp } from "./ssrf.js";

const fixturesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../fixtures");
const BODY = "id,title,price\n1,Test,10.00\n";

async function text(r: Readable): Promise<string> {
  let s = "";
  for await (const c of r) s += c.toString();
  return s;
}

describe("SSRF guard", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.0.111", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fe80::1", "fd00::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "224.0.0.1", "not-an-ip"])(
    "blocks %s",
    (ip) => expect(isBlockedIp(ip)).toBe(true),
  );
  it.each(["93.184.216.34", "1.1.1.1", "2606:4700:4700::1111"])("allows %s", (ip) => expect(isBlockedIp(ip)).toBe(false));
});

describe("fixture URLs", () => {
  it("parses names", () => {
    expect(fixtureName("fixture:direct-sample.xml")).toBe("direct-sample.xml");
    expect(fixtureName("https://fixtures.invalid/direct-sample.xml")).toBe("direct-sample.xml");
    expect(fixtureName("https://shop.example.ro/feed.xml")).toBeNull();
    expect(() => fixtureName("fixture:../etc/passwd")).toThrow();
  });
  it("is refused unless enabled, and supports ETag", async () => {
    const opts: DownloadOptions = { maxBytes: 1e6, timeoutMs: 5000, allowFixtures: false, fixturesDir };
    await expect(download("fixture:direct-sample.xml", opts)).rejects.toThrow(/disabled/);
    const r = await download("fixture:direct-sample.xml", { ...opts, allowFixtures: true });
    expect(r.notModified).toBe(false);
    if (r.notModified) return;
    expect(await text(r.body)).toContain("<products");
    const again = await download("fixture:direct-sample.xml", { ...opts, allowFixtures: true, etag: r.etag });
    expect(again.notModified).toBe(true);
  });
});

describe("HTTP download", () => {
  let server: http.Server;
  let base = "";
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === "/plain") {
        if (req.headers["if-none-match"] === '"v1"') {
          res.writeHead(304).end();
          return;
        }
        res.writeHead(200, { etag: '"v1"', "last-modified": "Tue, 24 Nov 2026 10:00:00 GMT" }).end(BODY);
      } else if (req.url === "/gzip") {
        res.writeHead(200, { "content-encoding": "gzip" }).end(zlib.gzipSync(BODY));
      } else if (req.url === "/feed.csv.gz") {
        res.writeHead(200).end(zlib.gzipSync(BODY));
      } else if (req.url === "/sniff") {
        res.writeHead(200).end(zlib.gzipSync(BODY));
      } else if (req.url === "/big") {
        res.writeHead(200).end("x".repeat(5000));
      } else if (req.url === "/redirect") {
        res.writeHead(302, { location: "/plain" }).end();
      } else res.writeHead(404).end();
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));
  const opts = (): DownloadOptions => ({ maxBytes: 1000, timeoutMs: 5000, allowFixtures: false, fixturesDir, allowPrivateHosts: true });

  it("refuses loopback without the test override", async () => {
    await expect(download(`${base}/plain`, { ...opts(), allowPrivateHosts: false })).rejects.toThrow(/private/);
    await expect(download("http://localhost:9/x", { ...opts(), allowPrivateHosts: false })).rejects.toThrow(/private|ECONNREFUSED/);
  });
  it("refuses non-http protocols", async () => {
    await expect(download("file:///etc/passwd", opts())).rejects.toThrow(/protocol/);
  });
  it("downloads, follows redirects and honours ETag (304)", async () => {
    const r = await download(`${base}/redirect`, opts());
    expect(r.notModified).toBe(false);
    if (r.notModified) return;
    expect(await text(r.body)).toBe(BODY);
    expect(r.etag).toBe('"v1"');
    expect((await download(`${base}/plain`, { ...opts(), etag: '"v1"' })).notModified).toBe(true);
  });
  it.each(["/gzip", "/feed.csv.gz", "/sniff"])("gunzips %s", async (p) => {
    const r = await download(`${base}${p}`, opts());
    if (r.notModified) throw new Error("unexpected");
    expect(await text(r.body)).toBe(BODY);
  });
  it("enforces the size limit", async () => {
    const r = await download(`${base}/big`, opts());
    if (r.notModified) throw new Error("unexpected");
    await expect(text(r.body)).rejects.toThrow(/feed_max_bytes/);
  });
});

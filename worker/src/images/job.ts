import type { Config } from "../config.js";
import type { Db } from "../db/pool.js";
import { loadSettings, type Settings } from "../db/settings.js";
import { errMessage, log } from "../log.js";
import { HostGate } from "./gate.js";
import { fetchImage } from "./source.js";
import { uploadObject } from "./storage.js";
import { makeThumbnail, thumbnailPath } from "./thumbnail.js";

export const IMAGE_QUEUE = "image-cache";

interface Candidate {
  product_id: number;
  offer_id: number;
  image_url: string;
}

export interface ImageStats {
  candidates: number;
  cached: number;
  failed: number;
}

/** Products without an image that have an active offer with an image URL not yet failed too often. */
export async function loadCandidates(db: Db, s: Settings, limit: number, afterProductId: number): Promise<Candidate[]> {
  const { rows } = await db.query<Candidate>(
    `select p.id as product_id, o.id as offer_id, o.image_url
     from public.products p
     join lateral (
       select id, image_url from public.offers
       where product_id = p.id and is_active and image_url is not null and image_fail_count < $1
       order by image_fail_count, price limit 1
     ) o on true
     where p.image_path is null and p.status = 'active' and p.id > $3
     order by p.id limit $2`,
    [s.imageMaxFailures, limit, afterProductId],
  );
  return rows;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "invalid";
  }
}

async function processOne(db: Db, config: Config, s: Settings, c: Candidate): Promise<boolean> {
  try {
    const raw = await fetchImage(c.image_url, config, s.imageMaxBytes);
    const thumb = await makeThumbnail(raw, { maxPx: s.imageMaxPx, quality: s.imageQuality });
    const objectPath = thumbnailPath(c.product_id, thumb.hash);
    await uploadObject(config.storageUrl, config.storageKey!, objectPath, thumb.data);
    const client = await db.connect();
    try {
      await client.query("begin");
      await client.query(
        `insert into public.product_images (product_id, storage_path, source_url, width, height, sort_order)
         values ($1, $2, $3, $4, $5, 0) on conflict (product_id, storage_path) do nothing`,
        [c.product_id, objectPath, c.image_url.slice(0, 2000), thumb.width, thumb.height],
      );
      await client.query("update public.products set image_path = $2 where id = $1 and image_path is null", [c.product_id, objectPath]);
      await client.query("update public.offers set image_checked_at = now(), image_last_error = null where id = $1", [c.offer_id]);
      await client.query("commit");
    } catch (e) {
      await client.query("rollback").catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
    return true;
  } catch (e) {
    const msg = errMessage(e).slice(0, 300);
    await db
      .query(
        `update public.offers set image_fail_count = image_fail_count + 1, image_last_error = $2, image_checked_at = now()
         where id = $1`,
        [c.offer_id, msg],
      )
      .catch(() => undefined);
    log.debug("image skipped", { productId: c.product_id, host: hostOf(c.image_url), error: msg });
    return false;
  }
}

/**
 * Caches thumbnails for products without image_path. Walks products by id (so a failing product is not picked
 * again in the same run), pages of `image_batch` products (max 10 pages per run), a small worker pool, per-host politeness.
 */
export async function runImageJob(db: Db, config: Config, signal?: AbortSignal): Promise<ImageStats> {
  const stats: ImageStats = { candidates: 0, cached: 0, failed: 0 };
  if (!config.storageKey) {
    log.warn("image job skipped: STORAGE_SERVICE_KEY is not set");
    return stats;
  }
  const s = await loadSettings(db);
  const gate = new HostGate(s.imageHostConcurrency, s.imageHostDelayMs);
  const POOL = 4;
  const MAX_PAGES = 10;
  let after = 0;
  for (let page = 0; page < MAX_PAGES && !signal?.aborted; page++) {
    const todo = await loadCandidates(db, s, Math.max(1, s.imageBatch), after);
    if (!todo.length) break;
    stats.candidates += todo.length;
    after = todo[todo.length - 1]!.product_id;
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(POOL, todo.length) }, async () => {
        while (!signal?.aborted) {
          const c = todo[next++];
          if (!c) return;
          const ok = await gate.run(hostOf(c.image_url), () => processOne(db, config, s, c));
          if (ok) stats.cached++;
          else stats.failed++;
        }
      }),
    );
    if (todo.length < s.imageBatch) break;
  }
  log.info("image job finished", { ...stats, heapMb: Math.round(process.memoryUsage().rss / 1048576) });
  return stats;
}

import { getAdapter, readOffers } from "../adapters/index.js";
import type { SourceOptions } from "../adapters/types.js";
import type { Config } from "../config.js";
import type { Db } from "../db/pool.js";
import { loadSettings } from "../db/settings.js";
import { download } from "../download/download.js";
import { errMessage, log } from "../log.js";
import { Matcher } from "../matching/matcher.js";
import { normalizeOffer } from "../normalize/offer.js";
import { BrandResolver, CategoryResolver } from "../normalize/resolvers.js";
import { emptyCounters, ErrorLog, sampleRss, type RunCounters } from "./report.js";
import { BATCH_SIZE, writeBatch, type PreparedRow } from "./upsert.js";

interface SourceRow {
  id: number;
  merchant_id: number;
  type: string;
  url: string;
  options: SourceOptions | null;
  etag: string | null;
  last_modified: string | null;
  last_row_count: number | null;
  schedule_minutes: number;
  has_affiliate: boolean;
}

/** Hard cap per run: bounds the memory of the per-run id set (about 100 bytes per id). */
const MAX_ROWS_PER_RUN = 2_000_000;

export type RunStatus = "ok" | "partial" | "not_modified" | "failed";

export interface RunOutcome {
  runId: number;
  status: RunStatus;
  counters: RunCounters;
  message: string | null;
}

/**
 * One feed run, streaming end to end (skill feed-import): download -> parse -> adapter -> validate/normalize ->
 * brand/category -> match -> batch upsert -> expire -> stats -> report in feed_runs.
 */
export async function runFeed(db: Db, config: Config, feedSourceId: number, signal?: AbortSignal): Promise<RunOutcome> {
  const src = await db.query<SourceRow>(
    `select fs.id, fs.merchant_id, fs.type, fs.url, fs.options, fs.etag, fs.last_modified, fs.last_row_count,
            fs.schedule_minutes, m.has_affiliate
     from public.feed_sources fs join public.merchants m on m.id = fs.merchant_id where fs.id = $1`,
    [feedSourceId],
  );
  const source = src.rows[0];
  if (!source) throw new Error(`feed source ${feedSourceId} not found`);

  const run = await db.query<{ id: number; started_at: Date }>(
    "insert into public.feed_runs (feed_source_id) values ($1) returning id, started_at",
    [feedSourceId],
  );
  const runId = run.rows[0]!.id;
  const startedAt = run.rows[0]!.started_at;
  const settings = await loadSettings(db);
  const counters = emptyCounters();
  const errors = new ErrorLog(db, runId, settings.feedMaxErrorsLogged);
  const rssTimer = setInterval(() => sampleRss(counters), 1000);
  rssTimer.unref();
  const t0 = Date.now();
  let status: RunStatus = "ok";
  let message: string | null = null;
  const notes: string[] = [];

  try {
    const adapter = getAdapter(source.type);
    const dl = await download(source.url, {
      etag: source.etag,
      lastModified: source.last_modified,
      maxBytes: settings.feedMaxBytes,
      timeoutMs: config.downloadTimeoutMs,
      allowFixtures: config.allowFixtures,
      fixturesDir: config.fixturesDir,
      allowPrivateHosts: config.allowPrivateHosts,
    });
    if (dl.notModified) {
      status = "not_modified";
      // Unchanged feed: its offers are still current, so keep them from being expired by expire_stale_offers().
      await db.query("update public.offers set last_seen_at = now() where feed_source_id = $1 and is_active", [feedSourceId]);
      await db.query(
        `update public.feed_sources set last_run_at = now(), next_run_at = now() + make_interval(mins => schedule_minutes)
         where id = $1`,
        [feedSourceId],
      );
    } else {
      const brands = new BrandResolver(db);
      const cats = new CategoryResolver(db, source.merchant_id);
      await cats.load();
      const touched = new Set<number>();
      const seen = new Set<string>();
      let skippedInactive = 0;
      let batch: PreparedRow[] = [];
      const ctx = { merchantId: source.merchant_id, feedSourceId, runStartedAt: startedAt };
      const flush = async () => {
        const b = batch;
        batch = [];
        if (!b.length) return;
        // One transaction per batch: products, offers, price history and queue rows land together or not at all.
        const client = await db.connect();
        try {
          await client.query("begin");
          await writeBatch(client, new Matcher(client, settings), ctx, b, counters, touched);
          await client.query("commit");
        } catch (e) {
          await client.query("rollback").catch(() => undefined);
          throw e;
        } finally {
          client.release();
        }
        sampleRss(counters);
      };

      for await (const ev of readOffers(adapter, dl.body, source.options ?? {})) {
        if (signal?.aborted) throw new Error("aborted (worker shutting down)");
        counters.rows_read++;
        if ("error" in ev) {
          counters.rows_invalid++;
          await errors.add(ev.row, null, null, ev.error);
          continue;
        }
        const n = normalizeOffer(ev.offer, { affiliate: adapter.affiliate && source.has_affiliate, allowedCurrencies: settings.allowedCurrencies });
        if (!n.ok) {
          if (n.skip) {
            skippedInactive++;
            continue;
          }
          counters.rows_invalid++;
          for (const e of n.errors) await errors.add(ev.row, ev.offer.id ?? null, e.field, e.reason);
          continue;
        }
        const o = n.offer;
        for (const w of n.warnings) await errors.add(ev.row, o.externalId, w.field, w.reason);
        if (seen.size >= MAX_ROWS_PER_RUN) throw new Error(`feed exceeds ${MAX_ROWS_PER_RUN} rows; split it or raise MAX_ROWS_PER_RUN`);
        if (seen.has(o.externalId)) {
          counters.rows_invalid++;
          await errors.add(ev.row, o.externalId, "id", "duplicate id in this feed (first row kept)");
          continue;
        }
        seen.add(o.externalId);
        counters.rows_valid++;
        const categoryId = await cats.resolve(o.categoryRaw);
        batch.push({
          offer: o,
          brandId: await brands.resolve(o.brandRaw),
          categoryId,
          topSlug: categoryId !== null ? (cats.topSlug.get(categoryId) ?? null) : null,
        });
        if (batch.length >= BATCH_SIZE) await flush();
      }
      await flush();
      await errors.flush();
      await cats.flushCounts();
      counters.categories_unmapped = cats.unmappedPaths.size;
      if (skippedInactive) notes.push(`${skippedInactive} inactive rows skipped`);
      if (brands.created) notes.push(`${brands.created} new brands`);

      // Expire offers of this source not seen in this run, unless the feed shrank suspiciously or is mostly invalid.
      const prev = source.last_row_count;
      let expirySkipped = false;
      const mostlyInvalid = counters.rows_read > 0 && counters.rows_invalid > counters.rows_read / 2;
      if (mostlyInvalid) {
        status = "partial";
        expirySkipped = true;
        notes.push("more than half of the rows are invalid: expiry skipped");
      } else if (prev && counters.rows_valid < prev * settings.feedMinRatio) {
        status = "partial";
        expirySkipped = true;
        notes.push(`expiry skipped: ${counters.rows_valid} valid rows < ${settings.feedMinRatio} x previous ${prev}`);
      } else {
        const ex = await db.query<{ product_id: number }>(
          `update public.offers set is_active = false, expired_at = now()
           where feed_source_id = $1 and is_active and last_seen_at < $2
           returning product_id`,
          [feedSourceId, startedAt],
        );
        counters.offers_expired = ex.rowCount ?? 0;
        for (const r of ex.rows) touched.add(r.product_id);
      }

      const ids = [...touched];
      for (let i = 0; i < ids.length; i += 1000) {
        await db.query("select public.refresh_product_stats($1::bigint[])", [ids.slice(i, i + 1000)]);
      }
      await db.query(
        `update public.feed_sources set last_run_at = now(), next_run_at = now() + make_interval(mins => schedule_minutes),
           etag = $2, last_modified = $3,
           -- A shrunken feed (expiry skipped) must not lower the baseline for the next ratio check.
           last_row_count = case when $5 then last_row_count else $4 end
         where id = $1`,
        [feedSourceId, dl.etag, dl.lastModified, counters.rows_valid, expirySkipped],
      );
    }
  } catch (e) {
    status = "failed";
    notes.unshift(errMessage(e));
    await errors.flush().catch(() => undefined);
    await db
      .query(
        // Interrupted by a shutdown: run again soon instead of waiting a full schedule interval.
        `update public.feed_sources set last_run_at = now(),
           next_run_at = now() + case when $2 then interval '5 minutes' else make_interval(mins => schedule_minutes) end
         where id = $1`,
        [feedSourceId, signal?.aborted ?? false],
      )
      .catch(() => undefined);
  } finally {
    clearInterval(rssTimer);
    sampleRss(counters);
  }

  if (errors.total > settings.feedMaxErrorsLogged) notes.push(`${errors.total} row errors, first ${settings.feedMaxErrorsLogged} stored`);
  notes.push(`${Math.round((Date.now() - t0) / 100) / 10}s`);
  message = notes.join("; ").slice(0, 2000);
  const c = counters;
  await db.query(
    `update public.feed_runs set status = $2, finished_at = now(), rows_read = $3, rows_valid = $4, rows_invalid = $5,
       products_new = $6, offers_new = $7, offers_updated = $8, offers_unchanged = $9, offers_expired = $10,
       price_changes = $11, categories_unmapped = $12, matches_queued = $13, peak_rss_mb = $14, message = $15
     where id = $1`,
    [runId, status, c.rows_read, c.rows_valid, c.rows_invalid, c.products_new, c.offers_new, c.offers_updated,
      c.offers_unchanged, c.offers_expired, c.price_changes, c.categories_unmapped, c.matches_queued, c.peak_rss_mb, message],
  );
  log.info("feed run finished", { feedSourceId, runId, status, ...c, message });
  return { runId, status, counters, message };
}

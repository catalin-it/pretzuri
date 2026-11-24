import type { Queryable } from "../db/pool.js";

export interface RunCounters {
  rows_read: number;
  rows_valid: number;
  rows_invalid: number;
  products_new: number;
  offers_new: number;
  offers_updated: number;
  offers_unchanged: number;
  offers_expired: number;
  price_changes: number;
  categories_unmapped: number;
  matches_queued: number;
  peak_rss_mb: number;
}

export function emptyCounters(): RunCounters {
  return {
    rows_read: 0, rows_valid: 0, rows_invalid: 0, products_new: 0, offers_new: 0, offers_updated: 0,
    offers_unchanged: 0, offers_expired: 0, price_changes: 0, categories_unmapped: 0, matches_queued: 0,
    peak_rss_mb: 0,
  };
}

export function sampleRss(c: RunCounters): void {
  const mb = Math.round(process.memoryUsage.rss() / 1024 / 1024);
  if (mb > c.peak_rss_mb) c.peak_rss_mb = mb;
}

/** Buffered writer for feed_run_errors (max `limit` rows per run). */
export class ErrorLog {
  private buf: Array<{ row_number: number | null; external_id: string | null; field: string | null; reason: string }> = [];
  private written = 0;
  public total = 0;
  constructor(private db: Queryable, private runId: number, private limit: number) {}

  async add(rowNumber: number | null, externalId: string | null, field: string | null, reason: string): Promise<void> {
    this.total++;
    if (this.written + this.buf.length >= this.limit) return;
    this.buf.push({ row_number: rowNumber, external_id: externalId?.slice(0, 100) ?? null, field, reason: reason.slice(0, 500) });
    if (this.buf.length >= 200) await this.flush();
  }

  async flush(): Promise<void> {
    if (!this.buf.length) return;
    const rows = this.buf;
    this.buf = [];
    await this.db.query(
      `insert into public.feed_run_errors (run_id, row_number, external_id, field, reason)
       select $1, r.row_number, r.external_id, r.field, r.reason
       from jsonb_to_recordset($2::jsonb) as r(row_number int, external_id text, field text, reason text)`,
      [this.runId, JSON.stringify(rows)],
    );
    this.written += rows.length;
  }
}

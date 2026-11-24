import type { PgBoss } from "pg-boss";
import type { Db } from "../db/pool.js";
import { errMessage, log } from "../log.js";
import { FEED_QUEUE, type FeedJob } from "./boss.js";

/**
 * Moves `import_requests` (written by pg_cron enqueue_due_feeds or an admin "run now") from pending into
 * pg-boss and marks them queued. Row locks are held while sending, so two workers never queue the same request;
 * a job whose request is already done is skipped by the handler. Requests stuck in `queued` for 6 hours (job lost)
 * go back to pending.
 */
export async function pollImportRequests(db: Db, boss: PgBoss): Promise<number> {
  const client = await db.connect();
  let n = 0;
  try {
    await client.query(
      "update public.import_requests set status = 'pending', picked_at = null where status = 'queued' and picked_at < now() - interval '6 hours'",
    );
    await client.query("begin");
    const { rows } = await client.query<{ id: number; feed_source_id: number }>(
      `select ir.id, ir.feed_source_id from public.import_requests ir
       where ir.status = 'pending' order by ir.requested_at limit 20 for update skip locked`,
    );
    for (const r of rows) {
      const data: FeedJob = { requestId: r.id, feedSourceId: r.feed_source_id };
      await boss.send(FEED_QUEUE, data);
      await client.query("update public.import_requests set status = 'queued', picked_at = now() where id = $1", [r.id]);
      n++;
    }
    await client.query("commit");
  } catch (e) {
    await client.query("rollback").catch(() => undefined);
    log.error("import request poll failed", { error: errMessage(e) });
  } finally {
    client.release();
  }
  if (n) log.info("queued import requests", { count: n });
  return n;
}

export async function markRequestDone(db: Db, requestId: number): Promise<boolean> {
  const r = await db.query("update public.import_requests set status = 'done' where id = $1 and status <> 'done'", [requestId]);
  return (r.rowCount ?? 0) > 0;
}

export async function requestIsOpen(db: Db, requestId: number): Promise<boolean> {
  const r = await db.query<{ status: string }>("select status from public.import_requests where id = $1", [requestId]);
  const s = r.rows[0]?.status;
  return s === "queued" || s === "pending";
}

import { loadConfig } from "./config.js";
import { createPool } from "./db/pool.js";
import { errMessage, log, setLogLevel } from "./log.js";
import { runFeed } from "./pipeline/run.js";
import { FEED_QUEUE, startBoss, type FeedJob } from "./queue/boss.js";
import { markRequestDone, pollImportRequests, requestIsOpen } from "./queue/poller.js";

async function main(): Promise<void> {
  const config = loadConfig();
  setLogLevel(config.logLevel);
  const db = createPool(config.databaseUrl);
  await db.query("select 1");
  const boss = await startBoss(config.databaseUrl);
  const abort = new AbortController();
  log.info("worker started", { env: config.env, fixtures: config.allowFixtures });

  // One job at a time (low memory, low CPU on the shared NAS).
  await boss.work<FeedJob>(FEED_QUEUE, { batchSize: 1, localConcurrency: 1, pollingIntervalSeconds: 5 }, async (jobs) => {
    for (const job of jobs) {
      const { requestId, feedSourceId } = job.data;
      if (!(await requestIsOpen(db, requestId))) {
        log.info("skipping job for a closed import request", { requestId });
        continue;
      }
      try {
        await runFeed(db, config, feedSourceId, abort.signal);
      } catch (e) {
        log.error("feed run crashed", { feedSourceId, error: errMessage(e) });
      } finally {
        await markRequestDone(db, requestId).catch(() => undefined);
      }
    }
  });

  let polling = false;
  const tick = async () => {
    if (polling || abort.signal.aborted) return;
    polling = true;
    try {
      await pollImportRequests(db, boss);
    } finally {
      polling = false;
    }
  };
  const timer = setInterval(() => void tick(), config.pollSeconds * 1000);
  void tick();

  let stopping = false;
  const shutdown = async (sig: string) => {
    if (stopping) return;
    stopping = true;
    log.info("shutting down", { signal: sig });
    clearInterval(timer);
    // Let a running feed stop at the next row; its run is reported as failed and re-run on the next schedule.
    abort.abort();
    try {
      await boss.stop({ graceful: true, timeout: 20_000 });
    } catch (e) {
      log.warn("pg-boss stop failed", { error: errMessage(e) });
    }
    await db.end().catch(() => undefined);
    log.info("stopped");
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((e) => {
  log.error("worker failed to start", { error: errMessage(e) });
  process.exit(1);
});

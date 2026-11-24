import { PgBoss } from "pg-boss";
import { IMAGE_QUEUE } from "../images/job.js";
import { log } from "../log.js";

export const FEED_QUEUE = "feed-import";

export interface FeedJob {
  requestId: number;
  feedSourceId: number;
}

/**
 * pg-boss in the `pgboss` schema (created by migration 0006; feed_worker has USAGE + CREATE on it but no
 * CREATE on the database, so `createSchema: false`). pg-boss installs/migrates its tables itself.
 */
export async function startBoss(connectionString: string): Promise<PgBoss> {
  const boss = new PgBoss({
    connectionString,
    schema: "pgboss",
    createSchema: false,
    max: 2,
    application_name: "pretzuri-worker-boss",
    schedule: false,
  });
  boss.on("error", (e: unknown) => log.error("pg-boss error", { error: e instanceof Error ? e.message : String(e) }));
  await boss.start();
  await boss.createQueue(FEED_QUEUE, {
    policy: "standard",
    // A big feed can take a while on the NAS; failures are not retried (the next schedule runs it again).
    expireInSeconds: 3 * 3600,
    retryLimit: 0,
    retentionSeconds: 7 * 24 * 3600,
    deleteAfterSeconds: 7 * 24 * 3600,
  });
  await boss.createQueue(IMAGE_QUEUE, {
    policy: "singleton", // never two image jobs at once; extra sends while one runs/waits are dropped
    expireInSeconds: 3600,
    retryLimit: 0,
    retentionSeconds: 24 * 3600,
    deleteAfterSeconds: 24 * 3600,
  });
  return boss;
}

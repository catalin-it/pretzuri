import { fileURLToPath } from "node:url";
import path from "node:path";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Config {
  databaseUrl: string;
  env: string;
  logLevel: LogLevel;
  /** `fixture:<name>` / `https://fixtures.invalid/<name>` feed URLs are served from `fixturesDir` (DEV/tests only). */
  allowFixtures: boolean;
  fixturesDir: string;
  /** How often import_requests are moved into pg-boss. */
  pollSeconds: number;
  downloadTimeoutMs: number;
  /** Tests only: skip the SSRF guard for 127.0.0.1 test servers. Never set in containers. */
  allowPrivateHosts: boolean;
}

const here = path.dirname(fileURLToPath(import.meta.url));

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const level = (env.LOG_LEVEL ?? "info") as LogLevel;
  return {
    databaseUrl,
    env: env.PRETZURI_ENV ?? "dev",
    logLevel: ["debug", "info", "warn", "error"].includes(level) ? level : "info",
    allowFixtures: env.WORKER_ALLOW_FIXTURES === "1",
    // dist/config.js and src/config.ts both sit one level below the package root.
    fixturesDir: env.WORKER_FIXTURES_DIR ?? path.resolve(here, "..", "fixtures"),
    pollSeconds: Math.max(5, Number(env.WORKER_POLL_SECONDS ?? 15) || 15),
    downloadTimeoutMs: Math.max(10_000, Number(env.WORKER_DOWNLOAD_TIMEOUT_MS ?? 60_000) || 60_000),
    allowPrivateHosts: false,
  };
}

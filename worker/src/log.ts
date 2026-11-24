// Minimal JSON line logger (stdout); never log secrets or full feed URLs (they may contain tokens).
import type { LogLevel } from "./config.js";

const order: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
let current: LogLevel = "info";

export function setLogLevel(level: LogLevel): void {
  current = level;
}

function write(level: LogLevel, msg: string, fields?: Record<string, unknown>): void {
  if (order[level] < order[current]) return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...fields });
  if (level === "error" || level === "warn") process.stderr.write(line + "\n");
  else process.stdout.write(line + "\n");
}

export const log = {
  debug: (msg: string, f?: Record<string, unknown>) => write("debug", msg, f),
  info: (msg: string, f?: Record<string, unknown>) => write("info", msg, f),
  warn: (msg: string, f?: Record<string, unknown>) => write("warn", msg, f),
  error: (msg: string, f?: Record<string, unknown>) => write("error", msg, f),
};

/** URL without credentials, query string and fragment (safe to log). */
export function redactUrl(raw: string): string {
  try {
    const u = new URL(raw);
    return `${u.protocol}//${u.host}${u.pathname}`;
  } catch {
    return "<invalid url>";
  }
}

export function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

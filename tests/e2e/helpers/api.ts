import { createHmac } from "node:crypto";
import { ANON_KEY, API_URL, MAILPIT_PASS, MAILPIT_URL, SERVICE_KEY } from "./env";

/** Service-role REST/RPC/Auth-admin access to DEV (tests only; the key is injected by infra/nas/e2e.sh). */
export async function rest<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...other } = init;
  const res = await fetch(`${API_URL}/rest/v1/${path}`, {
    ...other,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(headers as Record<string, string>),
    },
    body: json === undefined ? (other.body as BodyInit | undefined) : JSON.stringify(json),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`REST ${path} -> ${res.status}: ${text}`);
  return (text ? JSON.parse(text) : null) as T;
}

export const rpc = <T = unknown>(fn: string, args: Record<string, unknown> = {}) =>
  rest<T>(`rpc/${fn}`, { method: "POST", json: args });

export interface TestUser {
  id: string;
  email: string;
  password?: string;
}

async function authAdmin(path: string, init: { method?: string; json?: unknown } = {}) {
  const res = await fetch(`${API_URL}/auth/v1/admin/${path}`, {
    method: init.method ?? "GET",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: init.json === undefined ? undefined : JSON.stringify(init.json),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`auth admin ${path} -> ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

export async function createUser(prefix = "e2e", password?: string): Promise<TestUser> {
  const email = `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@example.test`;
  const u = await authAdmin("users", {
    method: "POST",
    json: { email, email_confirm: true, ...(password ? { password } : {}) },
  });
  return { id: u.id, email, password };
}

export async function deleteUser(id: string) {
  await authAdmin(`users/${id}`, { method: "DELETE" }).catch(() => undefined);
}

export async function grantAdmin(userId: string) {
  await rest("user_roles", {
    method: "POST",
    json: { user_id: userId, role: "admin" },
    headers: { Prefer: "resolution=ignore-duplicates" },
  });
}

const mailAuth = () => ({ Authorization: `Basic ${Buffer.from(`pretzuri:${MAILPIT_PASS}`).toString("base64")}` });

export async function clearMail(email: string) {
  await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`, {
    method: "DELETE",
    headers: mailAuth(),
  });
}

export interface Mail {
  ID: string;
  Subject: string;
  Snippet: string;
}

export async function waitMail(
  email: string,
  opts: { subject?: RegExp; timeoutMs?: number } = {},
): Promise<Mail & { Text: string; HTML: string }> {
  const until = Date.now() + (opts.timeoutMs ?? 30_000);
  while (Date.now() < until) {
    const res = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}&limit=20`, {
      headers: mailAuth(),
    });
    if (res.ok) {
      const body = (await res.json()) as { messages?: Mail[] };
      const m = body.messages?.find((x) => !opts.subject || opts.subject.test(x.Subject));
      if (m) {
        const full = await (await fetch(`${MAILPIT_URL}/api/v1/message/${m.ID}`, { headers: mailAuth() })).json();
        return { ...m, Text: full.Text ?? "", HTML: full.HTML ?? "" };
      }
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`no mail for ${email}`);
}

export async function mailCount(email: string): Promise<number> {
  const res = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}&limit=50`, {
    headers: mailAuth(),
  });
  return ((await res.json()) as { messages?: unknown[] }).messages?.length ?? 0;
}

/** Latest sign-in code for `email` (call clearMail first so an old code is never picked). */
export async function readCode(email: string): Promise<string> {
  const m = await waitMail(email);
  const code = (m.Text + " " + m.Snippet).match(/\b(\d{6})\b/);
  if (!code) throw new Error("no 6-digit code in mail");
  return code[1];
}

/** RFC 6238 TOTP (SHA-1, 30 s, 6 digits) from a base32 secret. */
export function totp(secret: string, at = Date.now()): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secret.replace(/=+$/, "").replace(/\s/g, "").toUpperCase()) {
    bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  }
  const bytes = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const h = createHmac("sha1", bytes).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, "0");
}

export const anonHeaders = () => ({ apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` });

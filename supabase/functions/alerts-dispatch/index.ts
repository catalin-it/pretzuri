// alerts-dispatch: drains public.alert_outbox (migration 0012) and sends price alerts by Web Push and email.
// Called by the database (pg_net, kick_alerts_dispatch()) at http://functions:9000/alerts-dispatch with header
// x-alerts-secret. FUNCTIONS_VERIFY_JWT=false, so the shared secret is the only guard: anything without the exact
// secret is rejected first. Logs carry status codes only (never endpoints, keys, emails or bodies).
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import webpush from "npm:web-push@3.6.7";
import nodemailer from "npm:nodemailer@7.0.10";
import { z } from "npm:zod@3.25.76";
import { emailMessage, isAllowedPushEndpoint, pushPayload, timingSafeEqual } from "./text.ts";

const BATCH_SIZE = 50;
const MAX_PER_INVOCATION = 500;
const TTL_SECONDS = 24 * 60 * 60;

const env = (k: string) => (Deno.env.get(k) ?? "").trim();
const SECRET = env("ALERTS_DISPATCH_SECRET");
const SUPABASE_URL = env("SUPABASE_URL");
const SERVICE_KEY = env("SUPABASE_SERVICE_ROLE_KEY");
const VAPID_SUBJECT = env("VAPID_SUBJECT");
const VAPID_PUBLIC_KEY = env("VAPID_PUBLIC_KEY");
const VAPID_PRIVATE_KEY = env("VAPID_PRIVATE_KEY");
const SMTP_HOST = env("SMTP_HOST");
const SMTP_PORT = Number(env("SMTP_PORT") || "587");
const SMTP_USER = env("SMTP_USER");
const SMTP_PASS = env("SMTP_PASS");
const SMTP_FROM = env("SMTP_ADMIN_EMAIL");
const SMTP_SENDER_NAME = env("SMTP_SENDER_NAME") || "Pretzuri";
const SITE_URL = env("SITE_URL");

const Sub = z.object({
  id: z.union([z.number(), z.string()]).transform(Number),
  endpoint: z.string(),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
});
const Row = z.object({
  outbox_id: z.union([z.number(), z.string()]).transform(Number),
  alert_id: z.union([z.number(), z.string()]).transform(Number),
  locale: z.string().nullable(),
  email: z.string().nullable(),
  send_push: z.boolean(),
  send_email: z.boolean(),
  product_slug: z.string(),
  product_title: z.string(),
  merchant_name: z.string().nullable(),
  price: z.union([z.number(), z.string()]).transform(Number),
  target_price: z.union([z.number(), z.string()]).transform(Number),
  subscriptions: z.array(Sub).nullable().transform((v) => v ?? []),
});
type Row = z.infer<typeof Row>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function makeTransport() {
  const secure = SMTP_PORT === 465;
  const starttls = SMTP_PORT === 587;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure,
    requireTLS: starttls,
    ignoreTLS: !secure && !starttls,
    auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });
}

type Transport = ReturnType<typeof makeTransport>;

async function sendPush(row: Row) {
  const dead: number[] = [];
  const used: number[] = [];
  const errors: string[] = [];
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) return { ok: false, dead, used, errors: ["vapid_missing"] };
  const payload = pushPayload(row);
  for (const sub of row.subscriptions) {
    if (!isAllowedPushEndpoint(sub.endpoint)) {
      dead.push(sub.id);
      continue;
    }
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, {
        TTL: TTL_SECONDS,
        urgency: "normal",
        topic: `alert${row.alert_id}`.slice(0, 32),
      });
      used.push(sub.id);
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) dead.push(sub.id);
      else errors.push(`push:${status ?? (e as { code?: string }).code ?? "error"}`);
    }
  }
  // Done when nothing is left to retry (delivered somewhere, or every subscription is gone, or there were none).
  return { ok: errors.length === 0 || used.length > 0, dead, used, errors };
}

async function sendEmail(transport: Transport, row: Row) {
  if (!row.email) return { ok: true, errors: [] as string[] };
  const mail = emailMessage(row, SITE_URL);
  try {
    await transport.sendMail({
      from: { name: SMTP_SENDER_NAME, address: SMTP_FROM },
      to: row.email,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      headers: { "List-Unsubscribe": `<${mail.unsubscribeUrl}>` },
    });
    return { ok: true, errors: [] as string[] };
  } catch (e) {
    return { ok: false, errors: [`email:${(e as { responseCode?: number; code?: string }).responseCode ?? (e as { code?: string }).code ?? "error"}`] };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const provided = req.headers.get("x-alerts-secret") ?? "";
  if (SECRET.length < 16 || !timingSafeEqual(provided, SECRET)) return json({ error: "unauthorized" }, 401);
  if (!SUPABASE_URL || !SERVICE_KEY || !SITE_URL) {
    console.error("alerts-dispatch misconfigured: missing env");
    return json({ error: "misconfigured" }, 500);
  }
  if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  }
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const transport = SMTP_HOST && SMTP_FROM ? makeTransport() : null;

  const totals = { rows: 0, push: 0, email: 0, failed: 0, dead: 0 };
  while (totals.rows < MAX_PER_INVOCATION) {
    const { data, error } = await supabase.rpc("claim_alert_outbox", { p_limit: BATCH_SIZE });
    if (error) {
      console.error("claim_alert_outbox failed", error.code ?? "");
      return json({ error: "claim_failed", ...totals }, 500);
    }
    const parsed = z.array(Row).safeParse(data ?? []);
    if (!parsed.success) {
      console.error("claim_alert_outbox returned an unexpected shape");
      return json({ error: "bad_batch", ...totals }, 500);
    }
    if (parsed.data.length === 0) break;
    for (const row of parsed.data) {
      totals.rows++;
      const errors: string[] = [];
      let pushOk = !row.send_push;
      let dead: number[] = [];
      let used: number[] = [];
      if (row.send_push) {
        const r = await sendPush(row);
        pushOk = r.ok;
        dead = r.dead;
        used = r.used;
        errors.push(...r.errors);
        totals.push += r.used.length;
        totals.dead += r.dead.length;
      }
      let emailOk = !row.send_email;
      if (row.send_email) {
        if (!transport) errors.push("smtp_missing");
        else {
          const r = await sendEmail(transport, row);
          emailOk = r.ok;
          errors.push(...r.errors);
          if (r.ok) totals.email++;
        }
      }
      if (!pushOk || !emailOk) totals.failed++;
      const { error: cErr } = await supabase.rpc("complete_alert_outbox", {
        p_outbox_id: row.outbox_id,
        p_push_ok: pushOk,
        p_email_ok: emailOk,
        p_error: errors.length ? errors.slice(0, 5).join(",") : null,
        p_dead_subscription_ids: dead,
        p_used_subscription_ids: used,
      });
      if (cErr) console.error("complete_alert_outbox failed", cErr.code ?? "");
    }
  }
  return json(totals);
});

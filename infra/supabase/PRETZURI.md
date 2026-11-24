# Self-hosted Supabase for Pretzuri

Vendored from `supabase/supabase` tag **`self-hosted/v0.8.4`** (`docker/` folder), via the kissorslap setup.
`.env.example` was renamed to `env.template`. Only the files the stack needs were copied.

## Local modifications to upstream files
1. `docker-compose.yml`: `name:` comes from `COMPOSE_PROJECT_NAME` and is required (no shared default `supabase`).
2. `docker-compose.yml`: all `container_name:` lines removed, so pretzuri-dev/prod and the other apps on the NAS
   never collide. Realtime keeps its hostname through a network alias in `docker-compose.pretzuri.yml`.
3. `docker-compose.yml`: host ports explicit and IP-bound (`API_GW_BIND_IP`/`API_GW_HTTP_PORT`,
   `DB_BIND_IP`/`POOLER_SESSION_HOST_PORT`/`POOLER_PROXY_PORT_TRANSACTION`), default `127.0.0.1`.
4. `volumes/api/envoy/docker-entrypoint.sh`: optional `GATEWAY_DENY_DASHBOARD=true` turns the Studio catch-all
   route into DENY (set on PROD).
5. `docker-compose.yml`: `GOTRUE_MFA_TOTP_ENROLL_ENABLED` / `_VERIFY_ENABLED` enabled through env (admin step-up).
6. `docker-compose.yml`: removed `api-gw depends_on studio` and `storage depends_on imgproxy` so these can be
   profile-disabled; `ENABLE_IMAGE_TRANSFORMATION` defaults to false.

When upgrading, re-copy upstream and re-apply 1–6; diff against upstream for anything else.
The logging stack (Logflare + Vector) is not included, to save RAM.

## Override files (loaded via `COMPOSE_FILE`)
- `docker-compose.pretzuri.yml` (dev + prod): realtime in profile `realtime` (off: no chat in Pretzuri) with its
  network alias; `email-templates` (busybox httpd serving `volumes/email-templates/` to GoTrue); auth wiring for
  the email code (length, expiry, templates, subjects), optional password, rate limits (`AUTH_RATE_LIMIT_HEADER`
  = `CF-Connecting-IP`), session limits; env for the price-alert functions (VAPID, SMTP, dispatch secret);
  optional profiles `studio` (studio + meta), `pooler` (supavisor), `imgproxy`.
- `docker-compose.dev-mail.yml` (DEV only): Mailpit, UI on `MAILPIT_BIND_IP:MAILPIT_UI_PORT` behind basic auth
  (user `pretzuri`, password generated on the NAS). SMTP_USER/PASS stay empty for Mailpit (GoTrue refuses SMTP AUTH
  on an unencrypted connection).
- `docker-compose.prod.yml` (PROD only): memory limits for studio/meta/imgproxy.

Active services by default: db, auth, rest, storage, functions, api-gw, email-templates (+ mailpit on DEV).
`deploy-supabase.sh <env> up` removes (project-scoped) containers of services whose profile is not enabled.
Envoy needs no change: the realtime/studio/meta clusters are STRICT_DNS, so with no hosts they answer 503.

## Edge Functions
`supabase/functions/<name>/` is synced by `infra/nas/deploy-supabase.sh` into `volumes/functions/<name>/`
(`main/` and `hello/` are kept); only the `functions` service is recreated when function code changed.

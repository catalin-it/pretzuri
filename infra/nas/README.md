# Pretzuri on the NAS (Docker, shared Synology 192.168.0.111)

The NAS is shared with other apps (kissorslap-*, jellyfin, overseerr, DSM packages). Pretzuri only uses the
compose projects `pretzuri-dev`, `pretzuri-dev-web`, `pretzuri-dev-worker` (and `pretzuri-prod*` later) under
`/volume1/docker/pretzuri-*`. Never prune, never stop/rm without the project filter.

## Access
- SSH alias `pretzuri-nas` in `~/.ssh/config` (HostName 192.168.0.111, user `develope`, key `~/.ssh/seduce_nas`).
- Scripts run from the workstation (Git Bash) and use `docker compose -p <project>` over SSH.

## Day to day
| Command | What |
|---|---|
| `bash infra/nas/dev-up.sh` / `dev-down.sh` | start / stop all of DEV (stop keeps containers + data) |
| `bash infra/nas/deploy-supabase.sh dev [up]` | sync + configure (+ start) the Supabase stack |
| `bash infra/nas/deploy-web.sh dev` | build the web image on the NAS and (re)start it |
| `bash infra/nas/deploy-worker.sh dev` | build the feed worker and (re)start it |
| `bash infra/nas/db-migrate.sh dev [--dry-run]` | apply pending migrations |
| `bash infra/nas/gen-types.sh dev` | regenerate `src/lib/database.types.ts` (+ worker copy) |
| `echo "select 1;" \| bash infra/nas/psql.sh dev -tA` | ad-hoc SQL |

DEV runs only while we work; PROD (when deployed) runs permanently with `restart: unless-stopped`.

## Layout and ports (all bound to 127.0.0.1 except Mailpit; checked free on 2026-11-24)
| | DEV | PROD (reserved) |
|---|---|---|
| web (Next.js, published directly) | 3400 | 3500 |
| Supabase API gateway (Envoy) | 8400 | 8500 |
| pooler (profile `pooler`, off) | 54342 / 54343 | 54352 / 54353 |
| Mailpit UI (LAN, basic auth user `pretzuri`) | 8425 | — |

Taken by other apps (do not use): 3100, 3180, 3200, 3280, 5432, 8095–8097, 8100, 8125, 8200, 8310, 8989, 9091.
Folders: `/volume1/docker/pretzuri-dev/{supabase,web,worker}`. Secrets only in `supabase/.env` (mode 600) on the NAS.

Resource limits: the Synology kernel has no CFS quota support, so `cpus:` cannot be used; containers get
`mem_limit` plus a low `cpu_shares` weight, builds run with `nice`, and the worker limits its own concurrency.
Default Supabase services: db, auth, rest, storage, functions, api-gw, email-templates (+ mailpit on DEV).
Realtime, Studio, imgproxy and the pooler are off (profiles, see `infra/supabase/PRETZURI.md`).

## Feed worker
Compose project `pretzuri-<env>-worker` (`infra/worker/docker-compose.yml`), folder `<env folder>/worker`
(`src/`, `docker-compose.yml`, `worker.env`, `worker.secret.env`). No published ports; it joins the Supabase
network `pretzuri-<env>_default` and connects to host `db` as role `feed_worker` (table grants in migration 0006,
pg-boss tables in schema `pgboss`). Limits: `mem_limit: 768m`, `cpu_shares: 256`, Node heap 384 MB, one feed at a
time, image built with `nice`.

- `bash infra/nas/deploy-worker.sh dev`: syncs `worker/`, builds `pretzuri-worker:dev`, sets the `feed_worker`
  login (SCRAM verifier, so the password is not in the DB log), writes `worker.secret.env` (`DATABASE_URL`, mode 600,
  from `FEED_WORKER_DB_PASSWORD` in `supabase/.env`) and recreates the container. PROD needs `--yes`.
- Imports run from `import_requests` (pg_cron `enqueue_due_feeds` every 5 min for due sources, or manual):
  `echo "insert into import_requests (feed_source_id) values (<id>) on conflict do nothing;" | bash infra/nas/psql.sh dev`.
  Results: `select * from feed_runs order by id desc limit 5;` and `feed_run_errors`.
- DEV sample data: `bash infra/nas/psql.sh dev < infra/nas/seed/dev-feeds.sql` (3 test merchants, 4 feed sources
  with `https://fixtures.invalid/<file>` URLs served from `worker/fixtures` because `WORKER_ALLOW_FIXTURES=1` in
  `env/worker-dev.env`; never set it on PROD).
- Logs: `ssh pretzuri-nas "cd /volume1/docker/pretzuri-dev/worker && /usr/local/bin/docker compose -p pretzuri-dev-worker --env-file worker.env logs --tail 50"`.

## Public access: DNS, HTTPS, DSM

**Current state (2026-11-25):** the `it-ist.ro` zone is hosted at **ClouDNS** (ns41–44.cloudns.net), not at
Cloudflare. Cloudflare's proxy and "Always Use HTTPS" only work for zones whose nameservers are Cloudflare's
(partial/CNAME setup needs a paid plan). Choose one:

**Option A (recommended): move the `it-ist.ro` zone to Cloudflare (free plan).**
1. Cloudflare → Add a site → `it-ist.ro` → Free. Let it import the existing records and **check every record**
   (ds., mail, MX/TXT, the kissorslap-era records) against ClouDNS before switching.
2. At the registrar of `it-ist.ro`, replace the ClouDNS nameservers with the two Cloudflare ones shown.
3. Then continue with "Cloudflare records" below.

**Option B: keep ClouDNS.** Add CNAME `dev-pretzuri` and `api-dev-pretzuri` → `ds.it-ist.ro` (DNS only).
HTTPS via a Let's Encrypt cert in DSM (needs port 80 forwarded for the HTTP-01 challenge). Plain-HTTP requests are
not redirected (no Cloudflare, and we do not add a redirect container). Rate limiting must then use `X-Real-IP`
(set `AUTH_RATE_LIMIT_HEADER=X-Real-IP` in `env/dev.env`).

### Cloudflare records (Option A)
- `dev-pretzuri`, `api-dev-pretzuri` (later `pretzuri`, `api-pretzuri`): A record → home public IP (or CNAME →
  `ds.it-ist.ro`), **Proxied** (orange cloud).
- SSL/TLS → Overview: **Full (strict)**. SSL/TLS → Edge Certificates: **Always Use HTTPS = On**, minimum TLS 1.2.
- Network: WebSockets On (not needed now, harmless).
- DEV only for us: Security → WAF → Custom rules → "dev-only": `(http.host in {"dev-pretzuri.it-ist.ro"
  "api-dev-pretzuri.it-ist.ro"} and ip.src ne <home public IP>)` → Block.
  (The DSM access profile cannot do this behind the proxy: DSM only sees Cloudflare IPs.)
- Router: only 443 forwarded to the NAS (80 not needed with a Cloudflare origin certificate).

### Origin certificate (Option A)
1. Cloudflare → SSL/TLS → Origin Server → Create certificate: RSA, hosts `*.it-ist.ro, it-ist.ro`, 15 years.
2. DSM → Control Panel → Security → Certificate → Add → Import: private key + certificate (+ intermediate:
   Cloudflare Origin CA root). Then Settings → assign it to the four pretzuri reverse-proxy hosts.

### DSM Reverse Proxy (Control Panel → Login Portal → Advanced → Reverse Proxy → Create)
| Name | Source (HTTPS, 443) | Destination (HTTP) |
|---|---|---|
| pretzuri-dev | `dev-pretzuri.it-ist.ro` | `localhost:3400` |
| pretzuri-api-dev | `api-dev-pretzuri.it-ist.ro` | `localhost:8400` |
| (later) pretzuri-prod | `pretzuri.it-ist.ro` | `localhost:3500` |
| (later) pretzuri-api-prod | `api-pretzuri.it-ist.ro` | `localhost:8500` |

For each rule: enable HSTS; Custom Header → Create → WebSocket; Access control profile **cloudflare-only**.

**Access control profile `cloudflare-only`** (Login Portal → Advanced → Access Control Profile → Create): Allow
every range from https://www.cloudflare.com/ips-v4 and https://www.cloudflare.com/ips-v6, Deny all.
Why: GoTrue rate-limits on the `CF-Connecting-IP` header (`AUTH_RATE_LIMIT_HEADER`). Only Cloudflare may reach
these hosts, so nobody can forge that header by hitting the origin directly.

### Check
`curl -sI https://dev-pretzuri.it-ist.ro/ro` → 200; `curl -s https://dev-pretzuri.it-ist.ro/api/health`;
`curl -sI http://dev-pretzuri.it-ist.ro/` → 301 to https (Cloudflare).

## Backups (PROD, when deployed)
`backup-prod.sh` runs on the NAS (DSM Task Scheduler, daily) → `/volume1/docker/pretzuri-prod/backups/<ts>/`
(`db.dump`, `storage.tar.gz`), secrets copy in `keys-backup/`, 14-day retention. Back both folders up off the NAS
(Hyper Backup, separate encrypted jobs).

## Moving to a VPS later
Everything is plain docker compose + env: copy `infra/supabase`, `infra/web`, the worker compose and the env files,
restore `db.dump` + storage, point DNS at the VPS. Nothing in the code depends on Synology.

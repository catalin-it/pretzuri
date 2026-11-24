# Pretzuri
Price comparison PWA for Romania: shop offers for the same product, price history and price alerts.
Next.js + self-hosted Supabase + a Node.js feed import worker, all in Docker. Agents read `AGENTS.md` / `CLAUDE.md`.

## Development

DEV runs on the NAS only while we work:

```
bash infra/nas/dev-up.sh       # start pretzuri-dev (Supabase, web, worker)
bash infra/nas/dev-down.sh     # stop it again
```

Run the app locally against the DEV Supabase:

```
npm install
npm run dev        # http://localhost:3000, redirects to /ro
```

Create `.env.local` (never committed):

- `NEXT_PUBLIC_SUPABASE_URL` (DEV: `https://api-dev-pretzuri.it-ist.ro`)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (anon key only; never the service role key)

Other commands: `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e`, `npm run build`.
Worker: `npm --prefix worker test`. DB: `bash infra/nas/db-migrate.sh dev`, `bash infra/nas/gen-types.sh dev`.
Hosting, ports, domains and backups: `infra/nas/README.md`. Plan: `docs/ROADMAP.md`. Rules: `docs/DECISIONS.md`.

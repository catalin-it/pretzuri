#!/usr/bin/env bash
# Apply pending SQL migrations from supabase/migrations/ to the NAS database over SSH.
#   infra/nas/db-migrate.sh dev --dry-run   # list pending migrations only
#   infra/nas/db-migrate.sh dev             # apply pending migrations (each in one transaction)
#   infra/nas/db-migrate.sh prod --yes      # prod requires explicit --yes
# Tracks applied versions in supabase_migrations.schema_migrations (same table the Supabase CLI uses).
# Runs psql inside the db container, so no DB password or DB port is needed on the workstation.
set -euo pipefail

ENV="${1:?usage: db-migrate.sh <dev|prod> [--dry-run|--yes]}"
FLAG="${2:-}"
case "$ENV" in dev|prod) ;; *) echo "env must be dev or prod" >&2; exit 1 ;; esac
if [ "$ENV" = "prod" ] && [ "$FLAG" != "--yes" ] && [ "$FLAG" != "--dry-run" ]; then
  echo "refusing to migrate prod without --yes (try --dry-run first)" >&2; exit 1
fi

. "$(dirname "$0")/lib/project.sh"; nas_resolve "$ENV"
PROJECT="$NAS_PROJECT"
REMOTE="$NAS_BASE/supabase"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MIG_DIR="$ROOT/supabase/migrations"

psql_remote() {
  ssh pretzuri-nas "cd '$REMOTE' && export PATH=\$PATH:/usr/local/bin && docker compose -p '$PROJECT' exec -T db psql -U postgres -X -q -v ON_ERROR_STOP=1 $*"
}

psql_remote -tA <<'SQL' >/dev/null
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version text primary key, statements text[], name text
);
SQL

applied="$(echo "select version from supabase_migrations.schema_migrations order by 1;" | psql_remote -tA)"

pending=0
for f in "$MIG_DIR"/*.sql; do
  base="$(basename "$f" .sql)"
  version="${base%%_*}"
  name="${base#*_}"
  if grep -qx "$version" <<<"$applied"; then continue; fi
  pending=$((pending + 1))
  if [ "$FLAG" = "--dry-run" ]; then echo "pending: $base"; continue; fi
  echo "==> applying $base to $PROJECT"
  { cat "$f"; printf "\ninsert into supabase_migrations.schema_migrations(version, name) values ('%s', '%s');\n" "$version" "$name"; } \
    | psql_remote --single-transaction
done
[ "$pending" -eq 0 ] && echo "==> $PROJECT is up to date" || true

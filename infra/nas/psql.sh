#!/usr/bin/env bash
# Run SQL from stdin against the NAS database (psql inside the db container, as postgres).
#   infra/nas/psql.sh dev < query.sql
#   echo "select 1;" | infra/nas/psql.sh dev
#   infra/nas/psql.sh prod --yes < query.sql     # prod requires explicit --yes
# Output is unaligned/tuples-only friendly; add psql flags after the env, e.g. `dev -tA`.
set -euo pipefail

ENV="${1:?usage: psql.sh <dev|prod> [--yes] [psql flags] < file.sql}"; shift
case "$ENV" in dev|prod) ;; *) echo "env must be dev or prod" >&2; exit 1 ;; esac
if [ "$ENV" = "prod" ]; then
  [ "${1:-}" = "--yes" ] || { echo "refusing to run on prod without --yes" >&2; exit 1; }
  shift
fi
. "$(dirname "$0")/lib/project.sh"; nas_resolve "$ENV"
PROJECT="$NAS_PROJECT"
ARGS="$(printf '%q ' "$@")"   # keep args with spaces intact across ssh
ssh -o BatchMode=yes pretzuri-nas "cd '$NAS_BASE/supabase' && export PATH=\$PATH:/usr/local/bin && docker compose -p '$PROJECT' exec -T db psql -U postgres -X -v ON_ERROR_STOP=1 $ARGS" \
  2> >(grep -vE 'post-quantum|store now|pq.html' >&2)

#!/usr/bin/env bash
# Generate TypeScript DB types from the NAS database (throw-away postgres-meta container of the project).
#   infra/nas/gen-types.sh dev   -> src/lib/database.types.ts
set -euo pipefail

ENV="${1:-dev}"
case "$ENV" in dev|prod) ;; *) echo "env must be dev or prod" >&2; exit 1 ;; esac
. "$(dirname "$0")/lib/project.sh"; nas_resolve "$ENV"
PROJECT="$NAS_PROJECT"
REMOTE="$NAS_BASE/supabase"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/src/lib/database.types.ts"
mkdir -p "$(dirname "$OUT")"

# postgres-meta is an optional service (profile "studio", off by default). A throw-away container of the same
# project (`run --rm --no-deps`) starts it just for this call; it does not touch the long-running stack.
ssh pretzuri-nas "cd '$REMOTE' && export PATH=\$PATH:/usr/local/bin && docker compose -p '$PROJECT' run --rm --no-deps -T meta sh -s" > "$OUT.tmp" <<'REMOTE_SCRIPT'
node dist/server/server.js >/dev/null 2>&1 &
i=0
while [ "$i" -lt 40 ]; do
  if node -e "fetch('http://localhost:8080/generators/typescript?included_schemas=public').then(r=>{if(!r.ok)throw new Error(r.status);return r.text()}).then(t=>process.stdout.write(t))" 2>/dev/null; then exit 0; fi
  i=$((i+1)); sleep 1
done
echo "postgres-meta did not answer" >&2
exit 1
REMOTE_SCRIPT
mv "$OUT.tmp" "$OUT"
echo "==> wrote $OUT"
# The worker has its own copy (separate package, no imports across package roots).
if [ -d "$ROOT/worker/src" ]; then
  mkdir -p "$ROOT/worker/src/db" && cp "$OUT" "$ROOT/worker/src/db/database.types.ts"
  echo "==> copied to worker/src/db/database.types.ts"
fi

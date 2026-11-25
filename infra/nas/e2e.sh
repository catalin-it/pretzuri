#!/usr/bin/env bash
# Run the Playwright suite ON the NAS in a throw-away container (no public DNS / SSH port forwarding needed).
#   bash infra/nas/e2e.sh dev                 # whole suite
#   bash infra/nas/e2e.sh dev 03-search       # only matching specs (extra args go to `playwright test`)
# DEV only. The container joins pretzuri-dev_default (web, api-gw, mailpit reachable by service name); secrets are
# read on the NAS from supabase/.env and passed as env vars (never printed).
set -euo pipefail

ENV="${1:?usage: e2e.sh dev [playwright args]}"; shift || true
[ "$ENV" = "dev" ] || { echo "E2E runs against DEV only" >&2; exit 1; }
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/lib/project.sh"; nas_resolve "$ENV"
ROOT="$HERE/../.."
REMOTE="$NAS_BASE/e2e"
IMAGE="mcr.microsoft.com/playwright:v1.65.1-noble"   # keep in sync with @playwright/test in package.json

echo "==> syncing tests to $NAS_HOST:$REMOTE"
nas_ssh "mkdir -p '$REMOTE/tests' && rm -rf '$REMOTE/tests/e2e'"
tar -C "$ROOT" -czf - tests/e2e | nas_ssh "tar -C '$REMOTE' -xzf -"
nas_ssh "cat > '$REMOTE/package.json'" <<'PKG'
{ "name": "pretzuri-e2e", "private": true, "devDependencies": { "@playwright/test": "1.65.1" } }
PKG

ARGS=""; for a in "$@"; do ARGS="$ARGS '$a'"; done
echo "==> running in $IMAGE"
nas_ssh "sh -s" <<REMOTE_SCRIPT
set -eu
export PATH=\$PATH:/usr/local/bin
ENVF='$NAS_BASE/supabase/.env'
E2E_MAILPIT_PASS=\$(grep '^MAILPIT_UI_PASS=' "\$ENVF" | cut -d= -f2-)
E2E_ANON_KEY=\$(grep '^ANON_KEY=' "\$ENVF" | cut -d= -f2-)
E2E_SERVICE_KEY=\$(grep '^SERVICE_ROLE_KEY=' "\$ENVF" | cut -d= -f2-)
export E2E_MAILPIT_PASS E2E_ANON_KEY E2E_SERVICE_KEY
docker run --rm --memory 1500m --ipc=host --network '$NAS_PROJECT'_default \
  -e E2E_BASE_URL=http://web:3000 -e E2E_API_URL=http://api-gw:8000 -e E2E_MAILPIT_URL=http://mailpit:8025 \
  -e E2E_MAILPIT_PASS -e E2E_ANON_KEY -e E2E_SERVICE_KEY -e CI=1 \
  -v '$REMOTE':/work -w /work/tests/e2e "$IMAGE" \
  sh -c "cd /work && { [ -d node_modules/@playwright/test ] || npm install --no-audit --no-fund >/dev/null; } && cd tests/e2e && npx playwright test -c playwright.config.ts --reporter=list $ARGS"
REMOTE_SCRIPT

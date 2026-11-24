#!/usr/bin/env bash
# Build and run the Pretzuri web app on the NAS (run from the workstation, Git Bash).
#   infra/nas/deploy-web.sh dev
#   infra/nas/deploy-web.sh prod --yes
# Only touches <env folder>/web and the web compose project (see lib/project.sh).
set -euo pipefail

ENV="${1:?usage: deploy-web.sh <dev|prod> [--yes]}"
case "$ENV" in dev|prod) ;; *) echo "env must be dev or prod" >&2; exit 1 ;; esac
if [ "$ENV" = "prod" ] && [ "${2:-}" != "--yes" ]; then
  echo "refusing to deploy PROD without --yes" >&2; exit 1
fi

HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/lib/project.sh"; nas_resolve "$ENV"
PROJECT="$NAS_WEB_PROJECT"
BASE="$NAS_BASE"
REMOTE="$BASE/web"
ROOT="$HERE/../.."
APP_COMMIT="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo local)"
[ -z "$(git -C "$ROOT" status --porcelain 2>/dev/null)" ] || APP_COMMIT="$APP_COMMIT-dirty"

echo "==> syncing source to $NAS_HOST:$REMOTE/src"
nas_ssh "mkdir -p '$REMOTE/src' && rm -rf '$REMOTE/src/'* '$REMOTE/src/.'[!.]* 2>/dev/null; true"
tar -C "$ROOT" -czf - \
  --exclude='./node_modules' --exclude='./.next' --exclude='./.git' --exclude='./infra' \
  --exclude='./supabase' --exclude='./tests' --exclude='./docs' --exclude='./.claude' \
  --exclude='./.cursor' --exclude='./worker' --exclude='.env*' --exclude='*.tsbuildinfo' . \
  | nas_ssh "tar -C '$REMOTE/src' -xzf -"
nas_ssh "cat > '$REMOTE/web.env'" < "$HERE/env/web-$ENV.env"
nas_ssh "cat > '$REMOTE/docker-compose.yml'" < "$ROOT/infra/web/docker-compose.yml"

echo "==> building pretzuri-web:$ENV and starting $PROJECT"
nas_ssh "sh -s" <<REMOTE_SCRIPT
set -eu
export PATH=\$PATH:/usr/local/bin
cd '$REMOTE'
set -a; . ./web.env; set +a
ANON=\$(grep '^ANON_KEY=' '$BASE/supabase/.env' | cut -d= -f2-)
[ -n "\$ANON" ] || { echo "ANON_KEY not found (run deploy-supabase.sh first)" >&2; exit 1; }
VAPID=\$(grep '^VAPID_PUBLIC_KEY=' '$BASE/supabase/.env' | cut -d= -f2- || true)
nice -n 10 docker build -q -t "pretzuri-web:$ENV" \
  --build-arg NEXT_PUBLIC_SUPABASE_URL="\$NEXT_PUBLIC_SUPABASE_URL" \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="\$ANON" \
  --build-arg NEXT_PUBLIC_VAPID_PUBLIC_KEY="\$VAPID" \
  --build-arg NEXT_PUBLIC_SITE_URL="\$NEXT_PUBLIC_SITE_URL" \
  --build-arg NEXT_PUBLIC_NOINDEX="\${NEXT_PUBLIC_NOINDEX:-true}" \
  --build-arg NEXT_PUBLIC_APP_COMMIT="$APP_COMMIT" \
  --build-arg NEXT_PUBLIC_APP_ENV="$ENV" \
  src
unset ANON VAPID
docker compose -p '$PROJECT' --env-file web.env up -d --wait
docker compose -p '$PROJECT' --env-file web.env ps
REMOTE_SCRIPT

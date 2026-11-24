#!/bin/sh
# Runs ON THE NAS (piped over ssh by deploy-supabase.sh). Usage: sh -s <dev|prod> <compose-project>
# Touches only /volume1/docker/<project>/supabase and that compose project. Never prints secrets.
set -eu
ENV="$1"
case "$ENV" in dev|prod) ;; *) echo "env must be dev or prod" >&2; exit 1 ;; esac
PROJECT="${2:?compose project required (passed by deploy-supabase.sh)}"
case "$PROJECT" in pretzuri-dev|pretzuri-prod) ;; *) echo "unexpected project $PROJECT" >&2; exit 1 ;; esac
DIR="/volume1/docker/$PROJECT/supabase"
export PATH="$PATH:/usr/local/bin"
cd "$DIR"

# DSM's Docker does not auto-create missing bind-mount sources.
mkdir -p volumes/db/data volumes/storage volumes/snippets volumes/functions

if [ ! -f .env ]; then
  umask 077
  cp env.template .env
  sh utils/generate-keys.sh --update-env >/dev/null
  rm -f .env.old
  echo "==> generated fresh secrets in $DIR/.env"
fi
chmod 600 .env

# set_secret KEY VALUE: replace or append one line in .env (value never printed).
set_secret() {
  umask 077
  grep -v "^$1=" .env > .env.tmp || true
  cat .env.tmp > .env && rm -f .env.tmp
  printf '%s=%s\n' "$1" "$2" >> .env
}
rand_hex() { head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'; }

# DEV Mailpit UI password.
if grep -q 'docker-compose.dev-mail.yml' pretzuri.env && ! grep -q '^MAILPIT_UI_PASS=.' .env; then
  set_secret MAILPIT_UI_PASS "$(rand_hex 24)"
  echo "==> generated MAILPIT_UI_PASS in $DIR/.env"
fi

# Feed worker DB password (role feed_worker, created by a migration; password applied by deploy-worker.sh).
if ! grep -q '^FEED_WORKER_DB_PASSWORD=.' .env; then
  set_secret FEED_WORKER_DB_PASSWORD "$(rand_hex 24)"
  echo "==> generated FEED_WORKER_DB_PASSWORD in $DIR/.env"
fi

# Shared secret for the price-alert dispatch function.
if ! grep -q '^ALERTS_DISPATCH_SECRET=.' .env; then
  set_secret ALERTS_DISPATCH_SECRET "$(rand_hex 32)"
  echo "==> generated ALERTS_DISPATCH_SECRET in $DIR/.env"
fi

# VAPID keys (Web Push): P-256, URL-safe base64.
if ! grep -q '^VAPID_PRIVATE_KEY=.' .env || ! grep -q '^VAPID_PUBLIC_KEY=.' .env; then
  KEYS="$(docker run --rm node:22-alpine node -e "
const c=require('crypto');const {publicKey,privateKey}=c.generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const pub=publicKey.export({format:'jwk'});const prv=privateKey.export({format:'jwk'});
const u=Buffer.concat([Buffer.from([4]),Buffer.from(pub.x,'base64url'),Buffer.from(pub.y,'base64url')]).toString('base64url');
console.log(u+' '+prv.d);")"
  VPUB="${KEYS%% *}"; VPRIV="${KEYS##* }"; unset KEYS
  [ -n "$VPUB" ] && [ -n "$VPRIV" ] && [ "$VPUB" != "$VPRIV" ] || { echo "VAPID key generation failed" >&2; exit 1; }
  set_secret VAPID_PUBLIC_KEY "$VPUB"
  set_secret VAPID_PRIVATE_KEY "$VPRIV"
  unset VPUB VPRIV
  echo "==> generated VAPID keys in $DIR/.env"
fi

# Apply non-secret overlay (replace existing key or append).
while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in ''|'#'*) continue ;; esac
  key="${line%%=*}"
  if grep -q "^$key=" .env; then
    awk -v k="$key" -v l="$line" 'index($0, k"=")==1 {print l; next} {print}' .env > .env.tmp
    cat .env.tmp > .env && rm -f .env.tmp
  else
    printf '%s\n' "$line" >> .env
  fi
done < pretzuri.env

# Safety: refuse to run if the project name does not match.
grep -q "^COMPOSE_PROJECT_NAME=$PROJECT\$" .env || { echo "project name mismatch, aborting" >&2; exit 1; }

docker compose -p "$PROJECT" config -q
echo "==> compose config valid for $PROJECT"

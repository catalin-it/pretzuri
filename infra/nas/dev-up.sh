#!/usr/bin/env bash
# Start the whole DEV environment on the NAS (Supabase, web, worker). DEV runs only while we work.
#   bash infra/nas/dev-up.sh
# Starts existing containers of the pretzuri-dev* projects only; deploys nothing (use deploy-*.sh for that).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/lib/project.sh"; nas_resolve dev

nas_ssh "sh -s" <<REMOTE_SCRIPT
set -eu
export PATH=\$PATH:/usr/local/bin
AVAIL=\$(free -m | awk '/^Mem:/ {print \$7}')
echo "==> NAS available memory: \${AVAIL} MB"
[ "\$AVAIL" -ge 900 ] || echo "warning: less than 900 MB available; DEV may squeeze other apps" >&2
if [ -f '$NAS_BASE/supabase/.env' ]; then
  cd '$NAS_BASE/supabase' && docker compose -p '$NAS_PROJECT' up -d --wait --no-recreate
else
  echo "Supabase DEV not deployed yet: run infra/nas/deploy-supabase.sh dev up" >&2; exit 1
fi
for P in web worker; do
  D='$NAS_BASE/'\$P
  if [ -f "\$D/docker-compose.yml" ]; then
    cd "\$D" && docker compose -p "$NAS_PROJECT-\$P" --env-file "\$P.env" up -d --no-recreate
  fi
done
docker ps --filter 'name=^$NAS_PROJECT-' --format 'table {{.Names}}\t{{.Status}}'
REMOTE_SCRIPT
echo "==> DEV is up: https://dev-pretzuri.it-ist.ro (Mailpit http://192.168.0.111:8425)"

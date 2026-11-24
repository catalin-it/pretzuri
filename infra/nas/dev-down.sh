#!/usr/bin/env bash
# Stop the whole DEV environment on the NAS to free RAM/CPU. Containers and data are kept (stop, not down).
#   bash infra/nas/dev-down.sh
# Only the pretzuri-dev, pretzuri-dev-web and pretzuri-dev-worker compose projects are touched.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/lib/project.sh"; nas_resolve dev

nas_ssh "sh -s" <<REMOTE_SCRIPT
set -eu
export PATH=\$PATH:/usr/local/bin
for P in worker web; do
  D='$NAS_BASE/'\$P
  if [ -f "\$D/docker-compose.yml" ]; then
    cd "\$D" && docker compose -p "$NAS_PROJECT-\$P" --env-file "\$P.env" stop
  fi
done
if [ -f '$NAS_BASE/supabase/.env' ]; then
  cd '$NAS_BASE/supabase' && docker compose -p '$NAS_PROJECT' stop
fi
echo "==> NAS available memory: \$(free -m | awk '/^Mem:/ {print \$7}') MB"
REMOTE_SCRIPT
echo "==> DEV is stopped"

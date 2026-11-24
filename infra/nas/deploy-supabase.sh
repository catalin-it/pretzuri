#!/usr/bin/env bash
# Deploy the self-hosted Supabase stack to the NAS (run from the workstation, Git Bash).
#   infra/nas/deploy-supabase.sh dev            # sync files + configure + validate
#   infra/nas/deploy-supabase.sh dev up         # ... and pull/start the stack
#   infra/nas/deploy-supabase.sh prod up --yes  # PROD needs explicit approval
# Only ever touches the env folder and compose project from lib/project.sh.
set -euo pipefail

ENV="${1:?usage: deploy-supabase.sh <dev|prod> [up] [--yes]}"
shift
ACTION=""; YES=""
for a in "$@"; do case "$a" in up) ACTION=up ;; --yes) YES=1 ;; *) echo "unknown arg: $a" >&2; exit 1 ;; esac; done
case "$ENV" in dev|prod) ;; *) echo "env must be dev or prod" >&2; exit 1 ;; esac
if [ "$ENV" = "prod" ] && [ -z "$YES" ]; then
  echo "refusing to deploy PROD without --yes" >&2; exit 1
fi

HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/lib/project.sh"; nas_resolve "$ENV"
PROJECT="$NAS_PROJECT"
REMOTE="$NAS_BASE/supabase"
SRC="$HERE/../supabase"
DC="cd '$REMOTE' && export PATH=\$PATH:/usr/local/bin && docker compose -p '$PROJECT'"

echo "==> syncing stack files to $NAS_HOST:$REMOTE"
tar -C "$SRC" -czf - --exclude='./volumes/db/data' --exclude='./volumes/storage/*' . \
  | nas_ssh "mkdir -p '$REMOTE' && tar -C '$REMOTE' -xzf -"
nas_ssh "cat > '$REMOTE/pretzuri.env'" < "$HERE/env/$ENV.env"

# Edge Functions: supabase/functions/<name>/ -> <stack>/volumes/functions/<name>/ (main/ and hello/ stay untouched).
FUNCS="$HERE/../../supabase/functions"
if [ -d "$FUNCS" ] && [ -n "$(ls -A "$FUNCS" 2>/dev/null)" ]; then
  echo "==> syncing edge functions"
  NAMES="$(cd "$FUNCS" && for d in */; do n="${d%/}"; case "$n" in main|hello) ;; *) printf '%s ' "$n" ;; esac; done)"
  FSUM='cd volumes/functions && find . -type f | sort | xargs md5sum | md5sum | cut -c1-32'
  BEFORE="$(nas_ssh "cd '$REMOTE' && $FSUM")"
  for n in $NAMES; do
    case "$n" in *[!a-zA-Z0-9_-]*) echo "bad function name: $n" >&2; exit 1 ;; esac
    nas_ssh "rm -rf '$REMOTE/volumes/functions/$n' && mkdir -p '$REMOTE/volumes/functions/$n'"
    tar -C "$FUNCS/$n" -czf - . | nas_ssh "tar -C '$REMOTE/volumes/functions/$n' -xzf -"
  done
  AFTER="$(nas_ssh "cd '$REMOTE' && $FSUM")"
  FUNCS_CHANGED=""; [ "$BEFORE" != "$AFTER" ] && FUNCS_CHANGED=1
fi

echo "==> configuring"
nas_ssh "sh -s $ENV $PROJECT" < "$HERE/remote-apply.sh"

if [ "$ACTION" = "up" ]; then
  echo "==> pulling images and starting $PROJECT (first run can take a while)"
  nas_ssh "$DC pull -q"
  # Remove containers of services not enabled by COMPOSE_PROFILES (explicit names, project-scoped; no-op if absent).
  nas_ssh "$DC --profile '*' config --services | sort > /tmp/$PROJECT.all && $DC config --services | sort > /tmp/$PROJECT.on && \
    OFF=\$(grep -vxF -f /tmp/$PROJECT.on /tmp/$PROJECT.all | tr '\n' ' '); rm -f /tmp/$PROJECT.all /tmp/$PROJECT.on; \
    if [ -n \"\$OFF\" ]; then echo \"==> removing disabled services of $PROJECT: \$OFF\"; $DC rm -sf \$OFF; fi"
  nas_ssh "$DC up -d --wait"
  nas_ssh "$DC ps --format 'table {{.Service}}\t{{.Status}}'"
fi

if [ -n "${FUNCS_CHANGED:-}" ]; then
  echo "==> function code changed: recreating functions service only"
  nas_ssh "$DC up -d --no-deps --force-recreate functions"
fi

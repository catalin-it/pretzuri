#!/usr/bin/env bash
# Store SMTP credentials (any SMTP provider) in the NAS supabase/.env WITHOUT putting them in git
# or printing them. Run it yourself in a terminal (it prompts; input is hidden):
#   bash infra/nas/set-smtp-secret.sh prod
# Then apply: bash infra/nas/deploy-supabase.sh prod up --yes
set -euo pipefail

ENV="${1:?usage: set-smtp-secret.sh <dev|prod>}"
case "$ENV" in dev|prod) ;; *) echo "env must be dev or prod" >&2; exit 1 ;; esac
. "$(dirname "$0")/lib/project.sh"; nas_resolve "$ENV"
[ -t 0 ] || { echo "run this interactively in a terminal" >&2; exit 1; }

read -r -p "SMTP login: " SMTP_U
read -r -s -p "SMTP password (hidden): " SMTP_K; echo
[ -n "$SMTP_U" ] && [ -n "$SMTP_K" ] || { echo "both values are required" >&2; exit 1; }
case "$SMTP_U$SMTP_K" in *$'\n'*|*'|'*) echo "unsupported character in input" >&2; exit 1 ;; esac

# Values travel over the ssh stdin only (never on a command line, never echoed).
printf '%s\n%s\n' "$SMTP_U" "$SMTP_K" | ssh -o BatchMode=yes pretzuri-nas "
  set -e
  cd $NAS_BASE/supabase
  IFS= read -r U; IFS= read -r K
  for kv in \"SMTP_USER=\$U\" \"SMTP_PASS=\$K\"; do
    k=\"\${kv%%=*}\"
    if grep -q \"^\$k=\" .env; then
      awk -v k=\"\$k\" -v l=\"\$kv\" 'index(\$0, k\"=\")==1 {print l; next} {print}' .env > .env.tmp && cat .env.tmp > .env && rm -f .env.tmp
    else
      printf '%s\n' \"\$kv\" >> .env
    fi
  done
  chmod 600 .env
  echo \"SMTP credentials stored: \$(grep -cE '^SMTP_(USER|PASS)=.+' .env) of 2\"
" 2> >(grep -vE 'post-quantum|store now|pq.html' >&2)
unset SMTP_U SMTP_K

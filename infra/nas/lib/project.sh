# Sourced by the infra/nas scripts. SINGLE place that maps an env to its NAS compose projects and folder.
# Sets: NAS_HOST (ssh alias), NAS_PROJECT (Supabase), NAS_WEB_PROJECT, NAS_WORKER_PROJECT, NAS_BASE.
NAS_HOST="pretzuri-nas"   # alias from ~/.ssh/config (HostName 192.168.0.111)
nas_resolve() {
  case "$1" in
    dev)  NAS_PROJECT="pretzuri-dev" ;;
    prod) NAS_PROJECT="pretzuri-prod" ;;
    *) echo "env must be dev or prod" >&2; return 1 ;;
  esac
  NAS_WEB_PROJECT="$NAS_PROJECT-web"
  NAS_WORKER_PROJECT="$NAS_PROJECT-worker"
  NAS_BASE="/volume1/docker/$NAS_PROJECT"
}
# ssh to the NAS without the post-quantum warning noise.
nas_ssh() {
  ssh -o BatchMode=yes "$NAS_HOST" "$@" 2> >(grep -vE 'post-quantum|store now|pq.html' >&2)
}

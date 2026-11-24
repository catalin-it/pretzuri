#!/bin/sh
# PROD backup. Runs ON THE NAS (DSM Task Scheduler) or via: ssh pretzuri-nas 'sh /volume1/docker/pretzuri-prod/backup/backup-prod.sh'
# Creates /volume1/docker/pretzuri-prod/backups/<UTC timestamp>/ (dir 700, files 600) with:
#   db.dump         pg_dump custom format of the postgres database (from inside the db container)
#   storage.tar.gz  volumes/storage (cached product images)
# The secrets copy (supabase/.env: JWT secret, VAULT_ENC_KEY, ...) is deliberately NOT stored next to db.dump.
# It goes to a separate restricted folder: /volume1/docker/pretzuri-prod/keys-backup/supabase-<TS>.env
# (dir 700, files 600). Back the two folders up with SEPARATE, client-side encrypted Hyper Backup jobs.
# Retention: 14 days (only timestamped entries inside backups/ and keys-backup/ are deleted). Never prints secrets.
# Install: infra/nas/backup-prod.sh is copied to /volume1/docker/pretzuri-prod/backup/ (see infra/nas/README.md).
set -eu
export PATH="$PATH:/usr/local/bin"
BASE=/volume1/docker/pretzuri-prod
SB="$BASE/supabase"
OUT_ROOT="$BASE/backups"
KEYS_ROOT="$BASE/keys-backup"
KEEP_DAYS=14
TS="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="$OUT_ROOT/$TS"

umask 077
mkdir -p "$OUT_ROOT"; chmod 700 "$OUT_ROOT"
mkdir -p "$KEYS_ROOT"; chmod 700 "$KEYS_ROOT"
mkdir "$DEST"; chmod 700 "$DEST"
KEYFILE="$KEYS_ROOT/supabase-$TS.env"
trap 'rc=$?; [ $rc -ne 0 ] && { echo "backup FAILED (rc=$rc), removing partial $DEST" >&2; rm -rf "$DEST" "$KEYFILE"; }; exit $rc' EXIT

cd "$SB"
docker compose -p pretzuri-prod exec -T db pg_dump -U postgres -d postgres -Fc --no-owner > "$DEST/db.dump"
[ -s "$DEST/db.dump" ] || { echo "empty dump" >&2; exit 1; }

cp "$SB/.env" "$KEYFILE"; chmod 600 "$KEYFILE"
tar -C "$SB/volumes" -czf "$DEST/storage.tar.gz" storage
chmod 600 "$DEST"/*

# Retention: remove timestamped backup dirs older than KEEP_DAYS.
find "$OUT_ROOT" -mindepth 1 -maxdepth 1 -type d -name '20??????T??????Z' -mtime +"$KEEP_DAYS" -exec rm -rf {} +
find "$KEYS_ROOT" -mindepth 1 -maxdepth 1 -type f -name 'supabase-20??????T??????Z.env' -mtime +"$KEEP_DAYS" -exec rm -f {} +

echo "backup ok: $DEST"
du -sh "$DEST"/* | sed "s#$DEST/##"
echo "keys copy: $KEYFILE"

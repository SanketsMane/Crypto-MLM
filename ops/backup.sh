#!/usr/bin/env bash
#
# Database backup.
#
# The ledger is append-only, which protects it from being rewritten — it does
# not protect it from the disk going away. This is the other half.
#
# Three properties worth stating, because a backup that lacks any of them is
# not a backup:
#
#   1. It is VERIFIED. A dump that cannot be restored is a file, not a backup.
#      Every run restores into a throwaway database and counts the ledger rows.
#   2. It is RETAINED on a schedule, so a corruption discovered next week can
#      still be rolled back past.
#   3. It FAILS LOUDLY. A silent backup failure is worse than no backup, because
#      it buys false confidence.
#
# Usage:  ./backup.sh            take a backup, verify it, prune old ones
#         ./backup.sh --verify-only <file>
#
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/fortunex}"
RETAIN_DAYS="${RETAIN_DAYS:-30}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

: "${DATABASE_URL:?DATABASE_URL must be set}"

log()  { printf '%s  %s\n' "$(date -u +%H:%M:%S)" "$*"; }
fail() { printf '%s  FAILED: %s\n' "$(date -u +%H:%M:%S)" "$*" >&2; exit 1; }

# ── verify: restore into a scratch database and count what came back ─────────
verify() {
  local file="$1"
  local scratch="fortunex_verify_$$"
  local admin_url="${DATABASE_URL%/*}/postgres"

  log "verifying $(basename "$file")"
  psql "$admin_url" -q -c "CREATE DATABASE \"$scratch\"" >/dev/null

  # Always drop the scratch database, however this exits.
  trap 'psql "$admin_url" -q -c "DROP DATABASE IF EXISTS \"'"$scratch"'\"" >/dev/null 2>&1 || true' RETURN

  if ! gunzip -c "$file" | psql "${DATABASE_URL%/*}/$scratch" -q >/dev/null 2>&1; then
    fail "restore failed — this dump is not usable"
  fi

  local ledger users
  ledger=$(psql -tAc "SELECT count(*) FROM ledger_entries" "${DATABASE_URL%/*}/$scratch")
  users=$(psql  -tAc "SELECT count(*) FROM users"          "${DATABASE_URL%/*}/$scratch")

  # A restore that succeeds but produces no schema is not a pass.
  [ -n "$ledger" ] || fail "restored database has no ledger table"

  log "verified — $users members, $ledger ledger entries"
}

if [ "${1:-}" = "--verify-only" ]; then
  [ -n "${2:-}" ] || fail "give a file to verify"
  verify "$2"
  exit 0
fi

mkdir -p "$BACKUP_DIR"
FILE="$BACKUP_DIR/fortunex-$STAMP.sql.gz"

log "backing up to $FILE"
# --clean --if-exists so the dump can be restored over an existing database.
pg_dump "$DATABASE_URL" --no-owner --no-acl --clean --if-exists \
  | gzip -9 > "$FILE" \
  || fail "pg_dump failed"

SIZE=$(du -h "$FILE" | cut -f1)
log "wrote $SIZE"

# An empty or near-empty file means pg_dump wrote nothing useful.
[ "$(stat -f%z "$FILE" 2>/dev/null || stat -c%s "$FILE")" -gt 1024 ] \
  || fail "backup is suspiciously small — treating as failed"

verify "$FILE"

log "pruning backups older than $RETAIN_DAYS days"
find "$BACKUP_DIR" -name 'fortunex-*.sql.gz' -mtime "+$RETAIN_DAYS" -print -delete

REMAINING=$(find "$BACKUP_DIR" -name 'fortunex-*.sql.gz' | wc -l | tr -d ' ')
log "done — $REMAINING backups retained"

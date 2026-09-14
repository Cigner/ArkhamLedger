#!/usr/bin/env bash
# Takes a compressed dump of the database.
#
# `--single-transaction` so the dump is consistent without locking anybody out,
# and routines, triggers and events because a restore that silently loses them
# is not a restore. The dump is written through the container's /backups mount,
# which is the same directory this script rotates.
#
# Retention follows the usual shape: a fortnight of dailies, a couple of months
# of weeklies, half a year of monthlies. Old dailies are cheap to keep and the
# one you want is almost always recent.

# shellcheck source=scripts/lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

KEEP_DAILY="${KEEP_DAILY:-14}"
KEEP_WEEKLY="${KEEP_WEEKLY:-8}"
KEEP_MONTHLY="${KEEP_MONTHLY:-6}"

LABEL="${1:-daily}"
STAMP="$(date -u '+%Y%m%dT%H%M%SZ')"
NAME="arkham-${LABEL}-${STAMP}.sql.gz"

load_env
mkdir -p "$BACKUP_DIR"

log "dumping $MYSQL_DATABASE to $NAME"

# The dump streams through the container's stdout rather than into the mount, so
# a backup works even when /backups is not mounted — on a laptop, say.
if ! db_exec mysqldump \
  -u root \
  --single-transaction \
  --routines --triggers --events \
  --default-character-set=utf8mb4 \
  --hex-blob \
  "$MYSQL_DATABASE" | gzip -9 > "$BACKUP_DIR/$NAME.partial"; then
  rm -f "$BACKUP_DIR/$NAME.partial"
  fail "mysqldump failed; no backup was written"
fi

# Named only once it is complete: a half-written file with the right name is
# what somebody restores at three in the morning without checking.
mv "$BACKUP_DIR/$NAME.partial" "$BACKUP_DIR/$NAME"

SIZE="$(du -h "$BACKUP_DIR/$NAME" | cut -f1)"
log "wrote $NAME ($SIZE)"

prune() {
  local label="$1" keep="$2"
  local files
  # shellcheck disable=SC2012
  files="$(ls -1t "$BACKUP_DIR"/arkham-"$label"-*.sql.gz 2>/dev/null || true)"
  [ -n "$files" ] || return 0

  printf '%s\n' "$files" | tail -n +"$((keep + 1))" | while read -r old; do
    log "pruning $(basename "$old")"
    rm -f "$old"
  done
}

prune daily "$KEEP_DAILY"
prune weekly "$KEEP_WEEKLY"
prune monthly "$KEEP_MONTHLY"
prune predeploy 5

log "backup complete"

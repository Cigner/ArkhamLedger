#!/usr/bin/env bash
# Restores a dump over a database.
#
# Destructive and deliberately awkward: it names what it is about to overwrite
# and refuses to proceed without a typed confirmation, because the one command
# in this repository that can lose everything should not be one keystroke from a
# command somebody meant to run.
#
#   scripts/restore.sh backups/arkham-daily-20260914T120000Z.sql.gz
#   TARGET_DATABASE=arkham_scratch scripts/restore.sh <dump>   # somewhere safe
#   CONFIRM=yes scripts/restore.sh <dump>                      # for automation

# shellcheck source=scripts/lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

DUMP="${1:-}"
[ -n "$DUMP" ] || fail "usage: restore.sh <dump.sql.gz>"
[ -f "$DUMP" ] || fail "no such dump: $DUMP"

load_env
TARGET="${TARGET_DATABASE:-$MYSQL_DATABASE}"

if [ "${CONFIRM:-}" != "yes" ]; then
  printf 'This replaces everything in "%s" with %s.\n' "$TARGET" "$(basename "$DUMP")"
  printf 'Type the database name to continue: '
  read -r answer
  [ "$answer" = "$TARGET" ] || fail "not confirmed"
fi

log "recreating $TARGET"
db_exec mysql -u root -e \
  "DROP DATABASE IF EXISTS \`$TARGET\`;
   CREATE DATABASE \`$TARGET\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;"

log "restoring from $(basename "$DUMP")"
gunzip -c "$DUMP" | db_exec mysql -u root --default-character-set=utf8mb4 "$TARGET"

log "restore complete"

#!/usr/bin/env bash
# Proves the most recent backup can actually be restored.
#
# An untested backup is a belief, not a backup. This restores the latest dump
# into a scratch database beside the live one and compares row counts table by
# table, so the failure modes that matter — a dump truncated by a full disk, a
# schema the current server will not accept, a character set that mangles names
# — surface on a Tuesday rather than during an incident.
#
# The scratch database is dropped afterwards whether or not the check passed.

# shellcheck source=scripts/lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

load_env

SCRATCH="${SCRATCH_DATABASE:-${MYSQL_DATABASE}_verify}"
DUMP="${1:-}"

if [ -z "$DUMP" ]; then
  # shellcheck disable=SC2012
  DUMP="$(ls -1t "$BACKUP_DIR"/arkham-*.sql.gz 2>/dev/null | head -1 || true)"
fi
[ -n "$DUMP" ] || fail "no backup found in $BACKUP_DIR"

log "verifying $(basename "$DUMP") into $SCRATCH"

cleanup() {
  db_exec mysql -u root -e "DROP DATABASE IF EXISTS \`$SCRATCH\`;" >/dev/null 2>&1 || true
}
trap cleanup EXIT

CONFIRM=yes TARGET_DATABASE="$SCRATCH" "$(dirname "${BASH_SOURCE[0]}")/restore.sh" "$DUMP"

counts_for() {
  db_exec mysql -u root --batch --skip-column-names -e "
    SELECT table_name, table_rows
    FROM information_schema.tables
    WHERE table_schema = '$1' AND table_type = 'BASE TABLE'
    ORDER BY table_name;"
}

# information_schema row counts are estimates for InnoDB, so the comparison is
# made with real counts on the tables that carry the data somebody would miss.
CHECKED_TABLES="auth_user campaign campaign_member game_session session_participant availability_slot schedule_run schedule_proposal notification"

failures=0
for table in $CHECKED_TABLES; do
  live="$(db_exec mysql -u root --batch --skip-column-names -e "SELECT COUNT(*) FROM \`$MYSQL_DATABASE\`.\`$table\`;" | tr -d '\r')"
  restored="$(db_exec mysql -u root --batch --skip-column-names -e "SELECT COUNT(*) FROM \`$SCRATCH\`.\`$table\`;" | tr -d '\r')"

  if [ "$live" = "$restored" ]; then
    printf '  %-24s %6s rows  ok\n' "$table" "$live"
  else
    printf '  %-24s live %s, restored %s  MISMATCH\n' "$table" "$live" "$restored"
    failures=$((failures + 1))
  fi
done

# One value read back in full, because a count proves the rows arrived and says
# nothing about whether the bytes did. Non-ASCII on purpose.
sample_live="$(db_exec mysql -u root --batch --skip-column-names -e "SELECT COALESCE(MD5(GROUP_CONCAT(name ORDER BY id)), 'none') FROM \`$MYSQL_DATABASE\`.auth_user;" | tr -d '\r')"
sample_restored="$(db_exec mysql -u root --batch --skip-column-names -e "SELECT COALESCE(MD5(GROUP_CONCAT(name ORDER BY id)), 'none') FROM \`$SCRATCH\`.auth_user;" | tr -d '\r')"

if [ "$sample_live" = "$sample_restored" ]; then
  printf '  %-24s %s\n' "names digest" "ok"
else
  printf '  %-24s live %s, restored %s  MISMATCH\n' "names digest" "$sample_live" "$sample_restored"
  failures=$((failures + 1))
fi

[ "$failures" -eq 0 ] || fail "$failures table(s) did not match; this backup is not trustworthy"

log "backup verified: every checked table restored identically"

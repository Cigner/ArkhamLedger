#!/usr/bin/env bash
# Shared plumbing for the operational scripts.
#
# Everything here talks to the database through `docker compose exec`, so the
# scripts work identically on the server and on a laptop, and never need the
# MySQL client installed on the host.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"
DB_SERVICE="${DB_SERVICE:-db}"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"

log()  { printf '%s  %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"; }
fail() { printf '%s  ERROR: %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*" >&2; exit 1; }

# Loads .env without exporting anything that is not a simple assignment.
load_env() {
  [ -f "$ENV_FILE" ] || fail "no environment file at $ENV_FILE"

  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a

  : "${MYSQL_DATABASE:?MYSQL_DATABASE must be set}"
  : "${MYSQL_ROOT_PASSWORD:?MYSQL_ROOT_PASSWORD must be set}"
}

compose() {
  docker compose -f "$ROOT_DIR/docker-compose.yml" "$@"
}

# Runs a command in the database container.
#
# The password goes in via the environment rather than on the command line: an
# argument is visible in `ps` to every user on the host for the life of the
# process.
db_exec() {
  compose exec -T \
    -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" \
    "$DB_SERVICE" "$@"
}

db_query() {
  db_exec mysql -u root --batch --skip-column-names "$MYSQL_DATABASE" -e "$1"
}

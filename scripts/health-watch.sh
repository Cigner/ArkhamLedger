#!/usr/bin/env bash
# Notices an outage nobody is watching for.
#
# Meant for cron on the host, every few minutes. Checks the two things that fail
# silently — the web tier and the worker — and emails the administrator when
# either has been down for three consecutive checks. Three rather than one
# because a restart during a deploy is not an incident, and an alert that cries
# wolf is an alert people filter.
#
#   */5 * * * * /srv/arkham/scripts/health-watch.sh
#
# State lives in a file rather than in the database: a database that is down is
# the most likely reason this script has something to say.

# shellcheck source=scripts/lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/health}"
WORKER_HEALTH_URL="${WORKER_HEALTH_URL:-http://127.0.0.1:3000/api/health/worker}"
STATE_FILE="${STATE_FILE:-${TMPDIR:-/tmp}/arkham-health-watch}"
THRESHOLD="${THRESHOLD:-3}"
ALERT_TO="${ALERT_TO:-}"

check() {
  curl -fsS --max-time 10 "$1" >/dev/null 2>&1
}

failures=0
[ -f "$STATE_FILE" ] && failures="$(cat "$STATE_FILE" 2>/dev/null || echo 0)"

problems=()
check "$HEALTH_URL"        || problems+=("web")
check "$WORKER_HEALTH_URL" || problems+=("worker")

if [ "${#problems[@]}" -eq 0 ]; then
  if [ "$failures" -gt 0 ]; then
    log "recovered after $failures failed checks"
  fi
  echo 0 > "$STATE_FILE"
  exit 0
fi

failures=$((failures + 1))
echo "$failures" > "$STATE_FILE"

log "unhealthy (${problems[*]}), $failures consecutive"

if [ "$failures" -eq "$THRESHOLD" ] && [ -n "$ALERT_TO" ]; then
  # Only on the transition to unhealthy: an alert every five minutes for a day
  # is how somebody learns to ignore this mailbox.
  printf 'Subject: Arkham Ledger is unhealthy (%s)\n\n%s has failed %s consecutive checks.\n' \
    "${problems[*]}" "${problems[*]}" "$failures" \
    | sendmail "$ALERT_TO" 2>/dev/null \
    || log "could not send mail; is sendmail configured?"
fi

exit 1

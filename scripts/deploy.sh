#!/usr/bin/env bash
# Deploys the current checkout.
#
# The order is the whole point: back up, build, migrate, start, then prove it
# works. Migrations run as a one-shot container that must exit zero before the
# new code starts, so new code never meets an old schema.
#
# If the health checks do not come good, the previous image is put back
# automatically. The database is NOT rolled back automatically, and that is
# deliberate — between the migration and the failure somebody may have written
# something, and a script that silently discards it would turn a bad deploy into
# a data loss. The command to do it by hand is printed instead.
#
#   scripts/deploy.sh              # deploy what is checked out
#   DEPLOY_PULL=1 scripts/deploy.sh
#   SKIP_BACKUP=1 scripts/deploy.sh   # only when there is nothing to lose

# shellcheck source=scripts/lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

COMPOSE_FILES=(-f "$ROOT_DIR/docker-compose.yml" -f "$ROOT_DIR/docker-compose.prod.yml")
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/health}"
WORKER_HEALTH_URL="${WORKER_HEALTH_URL:-http://127.0.0.1:3000/api/health/worker}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-120}"

deploy_compose() {
  docker compose "${COMPOSE_FILES[@]}" "$@"
}

load_env

REVISION="$(git -C "$ROOT_DIR" rev-parse --short HEAD 2>/dev/null || echo unknown)"
PREVIOUS_IMAGE="$(deploy_compose images -q web 2>/dev/null | head -1 || true)"

log "deploying $REVISION (previous image: ${PREVIOUS_IMAGE:-none})"

if [ "${DEPLOY_PULL:-0}" = "1" ]; then
  log "pulling"
  git -C "$ROOT_DIR" pull --ff-only
  REVISION="$(git -C "$ROOT_DIR" rev-parse --short HEAD)"
fi

if [ "${SKIP_BACKUP:-0}" != "1" ]; then
  "$ROOT_DIR/scripts/backup.sh" predeploy
else
  log "skipping backup at your request"
fi

log "building"
deploy_compose build

log "migrating"
if ! deploy_compose run --rm migrate; then
  fail "migrations failed; nothing was restarted and the old code is still serving"
fi

log "starting web and worker"
deploy_compose up -d web worker

# Tagged after a successful start so there is a name to roll back to next time.
if [ -n "${PREVIOUS_IMAGE:-}" ]; then
  docker tag "$PREVIOUS_IMAGE" "arkham:previous" 2>/dev/null || true
fi

wait_for() {
  local url="$1" label="$2" deadline=$((SECONDS + HEALTH_TIMEOUT))

  while [ "$SECONDS" -lt "$deadline" ]; do
    if curl -fsS --max-time 5 "$url" >/dev/null 2>&1; then
      log "$label is healthy"
      return 0
    fi
    sleep 3
  done

  return 1
}

rollback() {
  log "rolling back to the previous image"

  if [ -z "${PREVIOUS_IMAGE:-}" ]; then
    fail "no previous image recorded; fix forward or restore by hand"
  fi

  docker tag "$PREVIOUS_IMAGE" "$(deploy_compose config --images | head -1)" 2>/dev/null || true
  deploy_compose up -d --no-build web worker

  printf '\n'
  log "code rolled back. The database was NOT restored."
  log "If the migration is the problem, restore the pre-deploy dump by hand:"
  # shellcheck disable=SC2012
  log "  scripts/restore.sh $(ls -1t "$BACKUP_DIR"/arkham-predeploy-*.sql.gz 2>/dev/null | head -1 || echo '<dump>')"
  exit 1
}

if ! wait_for "$HEALTH_URL" "web"; then
  log "web did not become healthy within ${HEALTH_TIMEOUT}s"
  deploy_compose logs --tail 40 web || true
  rollback
fi

# The worker is given the same courtesy but is not a reason to roll back on its
# own: the site works without it, notifications simply queue up until it returns.
if ! wait_for "$WORKER_HEALTH_URL" "worker"; then
  log "WARNING: the worker is not reporting. Deliveries and deadlines are stalled."
  deploy_compose logs --tail 40 worker || true
fi

deploy_compose ps
log "deployed $REVISION"

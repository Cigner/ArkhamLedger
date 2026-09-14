# Troubleshooting

Failures seen, with the symptom that identifies each.

## Nobody is getting emails

**Look at:** `/admin` → Delivery, and the worker card above it.

| What it says                          | What it means                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------ |
| Worker "has not reported recently"    | The worker is down. Everything queues; nothing is lost. `docker compose logs worker` |
| Deliveries waiting, worker healthy    | It is working through them, or SMTP is slow. Waiting is normal for a minute          |
| Deliveries "given up on", with errors | Five attempts failed. The error text is the relay's own                              |

Nothing is ever deleted on failure. A `FAILED` delivery is the only record that
somebody was not told, which is why the screen lists the most recent ten.

## A deadline passed and nothing happened

Overdue deadlines are counted on the operations screen. One is a timing
artefact — the job runs every five minutes. A number that grows means the worker
is not running.

## The worker will not start

Check that the image contains `dist-worker/`. If it does not, `npm run
build:worker` was not run during the build. Check also that
`serverExternalPackages` still lists `mysql2` and `nodemailer` — the worker
bundle expects to find them in the standalone `node_modules`, and no test
catches their absence.

## Every Server Action is refused

Almost always the origin check. `ALLOWED_ORIGINS` must name the public origin,
and the reverse proxy must forward `X-Forwarded-Host`. Symptom: forms fail with
a generic error and the log shows a rejected origin.

## Somebody cannot sign in

| Symptom                                       | Cause                                                                                                                     |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| "Invalid credentials" with the right password | Account is `PENDING_ACTIVATION` or `DISABLED` — the message is identical on purpose                                       |
| 429                                           | Throttled. Three per ten seconds per IP from the library, ten per fifteen minutes per address from ours. It clears itself |
| The activation link says "already used"       | It was. Regenerate it from `/admin/users`                                                                                 |

## A campaign shows no dates at all

Open the session's Dates tab and read the diagnostic. It names who ruled out how
many evenings. The two usual causes:

- **Somebody is flagged as a Keeper who should not be.** A Keeper is a hard
  constraint on every window; if they never answer, nothing qualifies.
- **The quorum is unreachable.** It counts players, not participants. A quorum
  equal to the number of people including the Keeper can never be met.

## The database container will not start

Check the volume. `mysql_data` is a named volume; a compose file that binds a
host directory over it will start an empty database, and the application will
answer "no such table".

## After a restore, names look wrong

The dump and the restore both pass `--default-character-set=utf8mb4`. If a
restore was done by hand without it, non-ASCII names arrive mangled.
`verify-restore.sh` compares a digest of names precisely so this is caught
before it matters.

## Reading the logs

JSON on stdout, collected by Docker's `json-file` driver with rotation. Three
streams: `app` for domain events, `security` for failed sign-ins, rate limits,
authorization refusals and token use, and `http` for requests with durations.

Every entry carries a `correlationId`. When a user quotes the reference from an
error screen, that is the value to grep for.

```bash
docker compose logs web | grep '"correlationId":"…"'
docker compose logs worker --tail 100
```

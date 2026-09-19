# Backup and restore

An untested backup is a belief, not a backup. Everything here exists to make the
difference checkable.

## Taking one

```bash
scripts/backup.sh            # labelled "daily"
scripts/backup.sh weekly
scripts/backup.sh predeploy  # what deploy.sh runs
```

`mysqldump --single-transaction --routines --triggers --events
--default-character-set=utf8mb4 --hex-blob`, gzipped, into `backups/`.

- `--single-transaction` makes the dump consistent without locking anybody out.
- Routines, triggers and events are included because a restore that silently
  loses them is not a restore.
- The file is written as `.partial` and renamed only when complete. A
  half-written file with the right name is what somebody restores at three in
  the morning without checking.
- The password goes to the container through the environment, never as an
  argument — an argument is visible in `ps` to every user on the host.

Retention: 14 daily, 8 weekly, 6 monthly, 5 pre-deploy, pruned on every run.

## Restoring

```bash
scripts/restore.sh backups/arkham-daily-20260914T160434Z.sql.gz
```

Destructive and deliberately awkward: it names the database it is about to
replace and will not proceed until that name is typed back. The one command in
this repository that can lose everything should not be one keystroke away from a
command somebody meant to run.

```bash
TARGET_DATABASE=arkham_scratch scripts/restore.sh <dump>   # somewhere safe
CONFIRM=yes scripts/restore.sh <dump>                      # for automation
```

## Proving it works

```bash
scripts/verify-restore.sh
```

Restores the most recent dump into a scratch database beside the live one,
compares **real** `COUNT(*)` on the tables whose loss anybody would notice, and
compares an MD5 of every account name concatenated in id order. Then drops the
scratch database, whether or not the check passed.

The digest is there because a row count proves the rows arrived and says nothing
about whether the bytes did. Two of the seeded names are non-ASCII on purpose.

```
2026-09-14T16:04:39Z  verifying arkham-daily-20260914T160434Z.sql.gz into arkham_verify
  auth_user                    10 rows  ok
  campaign                      5 rows  ok
  campaign_member              20 rows  ok
  game_session                  7 rows  ok
  session_participant          32 rows  ok
  availability_slot           146 rows  ok
  schedule_run                  0 rows  ok
  schedule_proposal             0 rows  ok
  notification                  0 rows  ok
  names digest             ok
2026-09-14T16:04:42Z  backup verified: every checked table restored identically
```

Checked in both directions: a dump truncated at 9 kB fails with exit 1 and
leaves no scratch database behind.

Run it weekly from cron. A backup nobody has restored is a hypothesis.

## Rolling back a release that migrated the schema

Every migration in this repository so far is additive: new tables, new columns
with defaults, wider enums. An older application runs against a migrated
database unharmed, so the first move in an emergency is to put the previous
image back and stop, rather than to touch the schema at all. A schema rollback
is for the decision to abandon a feature, and it is the destructive option -
everything the feature stored goes with it.

For `0005_investigator_management`:

```bash
scripts/backup.sh predeploy
docker compose exec -T db mysql -u root -p"$MYSQL_ROOT_PASSWORD" arkham < scripts/rollback-0005.sql
```

The script drops the twenty-five Investigator tables, removes the columns the
migration added to `game_session` and `session_participant`, narrows both
widened enums, and deletes the journal row so the migration can be applied again
later. It handles the rows a narrowing would otherwise corrupt: a session left
`IN_PROGRESS` becomes `SCHEDULED`, and notifications of the ten new types are
deleted with their deliveries before the enum loses those values.

Verified by migrating a scratch database to `0005`, seeding exactly those rows,
running the script, and diffing `mysqldump --no-data` against a database
migrated only to `0004`: identical. The project owners repeat this against a
restored copy of production before the release gate is signed off, because a
rollback proven only on an empty database has not been proven.

## Off the machine

The scripts write to `backups/` on the host, which protects against human error
and not against the disk. Copy them somewhere else — another volume on the OMV
server, or an `rsync` to another machine — and treat that as part of the backup,
not as an optional extra.

`.env` is **not** in any dump and is the one thing a restore cannot reconstruct.
Keep an encrypted copy separately and update it whenever a secret changes.

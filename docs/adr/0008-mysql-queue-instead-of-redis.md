# ADR-0008: The queue is a table

**Status:** Accepted · 2026-09-13

## Context

Notifications need reliable, retryable delivery with backoff and no duplicates
after a restart. The obvious answer is Redis with BullMQ.

The load is a handful of messages after somebody presses a button, a few times a
week.

## Decision

`notification_delivery` is the queue. The worker claims rows with
`SELECT … FOR UPDATE SKIP LOCKED`.

## Alternatives

**Redis + BullMQ.** A second stateful service to run, back up, monitor and
upgrade, for a workload measured in messages per week. The backup story alone
costs more than the feature.

**A cron that scans for unsent rows without locking.** Works until two workers
run at once, then sends everything twice.

## Consequences

- One stateful service. One backup. One restore to test.
- The outbox is transactional with the change that caused it, which a separate
  broker cannot be without two-phase commit or an outbox table anyway.
- `UNIQUE(notification_id, channel)` makes duplication impossible rather than
  unlikely.
- A row left `SENDING` by a killed process needs explicit reclaiming by age; a
  broker would handle that itself. Ten lines of SQL and a test.
- If the load ever justified a broker, the change is local to
  `notifications/data/outbox.ts`. It will not.

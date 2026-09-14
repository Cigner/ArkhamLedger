# Extension points

Four seams exist because a second implementation is genuinely likely, not
because one is theoretically possible. Everything else is deliberately concrete
— see [conventions](../development/conventions.md) on where abstraction is
refused.

---

## 1. A delivery channel

**The port:** `modules/notifications/domain/dispatcher.ts`

```ts
export interface NotificationDispatcher {
  readonly channel: DeliveryChannel
  supports(context: DispatchContext): boolean
  send(context: DispatchContext): Promise<DeliveryOutcome>
}

export type DeliveryOutcome =
  | { kind: 'SENT'; reference?: string }
  | { kind: 'RETRYABLE'; error: string } // the queue will try again
  | { kind: 'PERMANENT'; error: string } // retrying wastes attempts
```

**To add Telegram:**

1. Add `'TELEGRAM'` to `deliveryChannels` in `src/db/schema/notification.ts` and
   generate a migration (`npm run db:generate`) — the column is an enum.
2. Write `modules/notifications/dispatchers/telegram.ts`.
3. Add it to the array in `dispatchers/registry.ts`.
4. Decide in `domain/preferences.ts` whether the channel is on by default and
   whether a person may switch it off.

Nothing in the worker, the outbox, or any code that raises a notification
changes. That is the property the interface buys.

**Two rules an implementation must respect**, both learned from what breaks
without them:

- **Never throw.** A dispatcher that throws takes the flush loop down and every
  other pending delivery waits behind it. Failure is a return value.
- **Never claim a channel you cannot serve.** `supports()` is how a dispatcher
  declines; returning a permanent failure instead burns an attempt and records
  an error for something that was never applicable.

**The test to write:** feed it a context with a deliberately broken target and
assert the outcome is classified correctly — retryable for a timeout, permanent
for a revoked credential. `dispatchers/discord.ts` is the worked example.

---

## 2. A scoring strategy

**Where:** `modules/scheduling/domain/scoring.ts`

Weights and the quality function are separated from the algorithm that generates
and filters candidates, so tuning does not touch the search:

```ts
export function valueAt(participant, slot): number
export function qualityOver(participant, core): number // the weakest hour
export function scoreFor(qualities): number // 0–100, two decimals
export function compareCandidates(a, b): number // the tie-breaker chain
```

**To change how windows are valued:** edit `PRIORITY_WEIGHT` or `STATE_VALUE` in
`domain/constants.ts`, then **bump `ALGORITHM_VERSION`**. Runs record the version
that produced them, which is what keeps an old proposal explainable.

**To add a new dimension** — say, preferring the hour the group usually starts
at — add a term to `scoreFor` or a step to `compareCandidates`. If two
strategies ever need to coexist, the shape to extract is:

```ts
interface ScoringStrategy {
  readonly version: string
  quality(participant, core): number
  score(qualities): number
  compare(a, b): number
}
```

passed into `rankCandidates` instead of imported by it. That refactor is a
morning's work and is deliberately not done in advance.

**The test to write:** add a case to `tests/unit/scheduling/scoring.test.ts`,
and expect `worked-example.test.ts` to fail — it asserts three exact scores. If
it does not fail, the change did nothing.

---

## 3. File storage

**Not built.** The files module is out of scope, but the seam is described here
so that adding it is a new file rather than a refactor.

```ts
export interface StoragePort {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>
  get(key: string): Promise<ReadableStream | null>
  delete(key: string): Promise<void>
}
```

The rules that will apply when it lands, because they are the ones that are
skipped: validate **magic bytes** rather than the extension or the declared
content type; store outside `public/`; generate the name on disk; serve only
through an authorised route handler with `Content-Disposition: attachment` and
`X-Content-Type-Options: nosniff`.

`scenario` is the table a `scenario_file` would hang from.

---

## 4. The identity provider

**The port:** `src/lib/auth/port.ts`, implemented over Better Auth in
`src/lib/auth/`.

Not there to make the library swappable — it is there so that a breaking change
in Better Auth 1.8 touches one directory instead of a hundred call sites. The
library has a documented history of breaking minor releases; this is insurance
with a known premium.

An ESLint rule makes importing `better-auth` anywhere outside `src/lib/auth/`
and `src/app/api/auth/` an error.

---

## What is deliberately not abstracted

**Repositories over Drizzle.** Drizzle will not be replaced, and `data/` already
forms the boundary by mapping rows to DTOs. A repository layer would add
ceremony and hide the SQL, and this application has queries whose SQL is worth
reading.

**A generic permission engine.** `requireKeeper`, `requireOwner` and the rest
are small, separate and individually auditable. One `can(action, resource)`
would be harder to audit and harder to test as a matrix.

**A template engine for emails.** Three sentences and a link, in plain text. See
[ADR-0006](../adr/0006-custom-availability-grid.md) for the same argument
applied to the availability interface.

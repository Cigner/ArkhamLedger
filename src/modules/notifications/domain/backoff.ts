/**
 * Retry schedule for failed deliveries.
 *
 * Spread rather than tight: a home SMTP relay that is down is usually down for
 * minutes, and hammering it makes the queue busy without making the mail
 * arrive. Five attempts over about five hours covers a restart or a short
 * outage; past that a human needs to look, which is what the failed state is
 * for.
 */
export const MAX_DELIVERY_ATTEMPTS = 5

const SCHEDULE_MS = [
  60_000,
  5 * 60_000,
  15 * 60_000,
  60 * 60_000,
  4 * 60 * 60_000,
] as const

/**
 * When to try again after `attempts` failures.
 *
 * Returns null once the attempts are spent, which is the signal to stop and
 * record the failure rather than to wait forever.
 */
export function nextAttemptAfter(attempts: number, now: Date): Date | null {
  if (attempts >= MAX_DELIVERY_ATTEMPTS) return null

  const delay = SCHEDULE_MS[Math.max(0, attempts - 1)] ?? SCHEDULE_MS[SCHEDULE_MS.length - 1]!
  return new Date(now.getTime() + delay)
}

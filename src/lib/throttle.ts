import 'server-only'
import { and, eq, lt, sql } from 'drizzle-orm'
import { db } from '@/db/client'
import { identityThrottle } from '@/db/schema'
import { securityLogger } from '@/lib/logger'

/**
 * Throttling by identifier rather than by address.
 *
 * For credentials the identifier is an email address: the auth library's own
 * limiter keys on IP, which an attacker rotates for free, so keying on the
 * target address as well makes a distributed guessing run no faster than a
 * single-source one. For expensive operations the identifier is the thing being
 * operated on - a session id - which bounds the cost one Keeper can impose by
 * holding down a button.
 *
 * Counters live in MySQL rather than in process memory so a limit survives a
 * restart: a deploy is precisely when a reset benefits an attacker, and this
 * deployment has no Redis to lean on.
 */
export type ThrottleScope = 'signin' | 'reset' | 'schedule'

export type ThrottleDecision =
  { readonly allowed: true } | { readonly allowed: false; readonly retryAfterSeconds: number }

type ThrottlePolicy = {
  readonly attempts: number
  readonly windowMs: number
  readonly blockMs: number
}

const POLICIES: Record<ThrottleScope, ThrottlePolicy> = {
  signin: { attempts: 10, windowMs: 15 * 60_000, blockMs: 15 * 60_000 },
  // Reset requests are cheap for an attacker and noisy for the victim's inbox,
  // so they are capped harder and over a longer window than sign-in attempts.
  reset: { attempts: 5, windowMs: 60 * 60_000, blockMs: 60 * 60_000 },
  /*
   * Searching for dates reads every answer in a session and scores a few hundred
   * windows. Cheap once, wasteful in a loop, and there is no reason to run it
   * ten times an hour on answers that have not changed. The block is short
   * because the caller is a Keeper doing their job, not an attacker.
   */
  schedule: { attempts: 10, windowMs: 60 * 60_000, blockMs: 10 * 60_000 },
}

function throttleKey(scope: ThrottleScope, identifier: string): string {
  return `${scope}:${identifier.trim().toLowerCase()}`.slice(0, 320)
}

/**
 * Records one attempt and reports whether it may proceed.
 *
 * The increment is a conditional UPDATE rather than read-then-write: two
 * simultaneous attempts must both count, and a check based on a prior read would
 * let a burst through the limit it was meant to enforce.
 */
export async function consumeAttempt(
  scope: ThrottleScope,
  identifier: string,
  now: Date = new Date(),
): Promise<ThrottleDecision> {
  const policy = POLICIES[scope]
  const key = throttleKey(scope, identifier)
  const windowStart = new Date(now.getTime() - policy.windowMs)

  // Reset any window that has fully elapsed before counting this attempt.
  await db
    .update(identityThrottle)
    .set({ attempts: 0, windowStartedAt: now, blockedUntil: null })
    .where(
      and(
        eq(identityThrottle.id, key),
        lt(identityThrottle.windowStartedAt, windowStart),
        sql`(${identityThrottle.blockedUntil} IS NULL OR ${identityThrottle.blockedUntil} <= ${now})`,
      ),
    )

  await db
    .insert(identityThrottle)
    .values({ id: key, attempts: 1, windowStartedAt: now, blockedUntil: null })
    .onDuplicateKeyUpdate({
      set: { attempts: sql`${identityThrottle.attempts} + 1` },
    })

  const [row] = await db
    .select()
    .from(identityThrottle)
    .where(eq(identityThrottle.id, key))
    .limit(1)

  if (!row) return { allowed: true }

  if (row.blockedUntil && row.blockedUntil > now) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((row.blockedUntil.getTime() - now.getTime()) / 1000),
    }
  }

  if (row.attempts > policy.attempts) {
    const blockedUntil = new Date(now.getTime() + policy.blockMs)
    await db.update(identityThrottle).set({ blockedUntil }).where(eq(identityThrottle.id, key))

    securityLogger.warn({ scope, attempts: row.attempts }, 'per-address throttle engaged')

    return { allowed: false, retryAfterSeconds: Math.ceil(policy.blockMs / 1000) }
  }

  return { allowed: true }
}

/** Clears the counter after a successful authentication. */
export async function clearAttempts(scope: ThrottleScope, identifier: string): Promise<void> {
  await db.delete(identityThrottle).where(eq(identityThrottle.id, throttleKey(scope, identifier)))
}

/** Housekeeping for the worker: drops counters whose window is long past. */
export async function deleteStaleThrottles(before: Date): Promise<number> {
  const [result] = await db
    .delete(identityThrottle)
    .where(lt(identityThrottle.windowStartedAt, before))
  return result.affectedRows
}

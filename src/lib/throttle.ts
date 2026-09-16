import 'server-only'
import { and, eq, lt, sql } from 'drizzle-orm'
import { db } from '@/db/client'
import { identityThrottle } from '@/db/schema'
import { securityLogger } from '@/lib/logger'

export type ThrottleScope = 'signin' | 'reset' | 'schedule' | 'feedback'

export type ThrottleDecision =
  { readonly allowed: true } | { readonly allowed: false; readonly retryAfterSeconds: number }

type ThrottlePolicy = {
  readonly attempts: number
  readonly windowMs: number
  readonly blockMs: number
}

const POLICIES: Record<ThrottleScope, ThrottlePolicy> = {
  signin: { attempts: 10, windowMs: 15 * 60_000, blockMs: 15 * 60_000 },
  reset: { attempts: 5, windowMs: 60 * 60_000, blockMs: 60 * 60_000 },
  schedule: { attempts: 10, windowMs: 60 * 60_000, blockMs: 10 * 60_000 },
  feedback: { attempts: 5, windowMs: 60 * 60_000, blockMs: 30 * 60_000 },
}

function throttleKey(scope: ThrottleScope, identifier: string): string {
  return `${scope}:${identifier.trim().toLowerCase()}`.slice(0, 320)
}

export async function consumeAttempt(
  scope: ThrottleScope,
  identifier: string,
  now: Date = new Date(),
): Promise<ThrottleDecision> {
  const policy = POLICIES[scope]
  const key = throttleKey(scope, identifier)
  const windowStart = new Date(now.getTime() - policy.windowMs)

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

export async function clearAttempts(scope: ThrottleScope, identifier: string): Promise<void> {
  await db.delete(identityThrottle).where(eq(identityThrottle.id, throttleKey(scope, identifier)))
}

export async function deleteStaleThrottles(before: Date): Promise<number> {
  const [result] = await db
    .delete(identityThrottle)
    .where(lt(identityThrottle.windowStartedAt, before))
  return result.affectedRows
}

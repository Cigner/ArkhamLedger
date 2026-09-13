import 'server-only'
import { and, eq, isNull, lt } from 'drizzle-orm'
import { type DbOrTx, db } from '@/db/client'
import { authUser, userActivationToken } from '@/db/schema'
import { hashToken, issueToken } from '@/lib/crypto'
import { newId } from '@/lib/ids'
import { securityLogger, tokenPrefix } from '@/lib/logger'
import { ACTIVATION_TOKEN_TTL_DAYS } from '../domain/constants'
import { isTokenUsable } from '../domain/rules'
import type { TokenCheck, UserStatus } from '../domain/types'

/**
 * Activation token lifecycle.
 *
 * Only the SHA-256 digest of a token is stored, so a database disclosure yields
 * no working links. The plaintext is returned exactly once, to the administrator
 * who issued it, and never logged in full.
 *
 * Issuing a new link revokes any outstanding one for that user: two live links
 * to the same account is a larger window than the feature needs.
 */
const MS_PER_DAY = 24 * 60 * 60 * 1000

export async function issueActivationToken(
  userId: string,
  issuedBy: string,
  now: Date,
  executor: DbOrTx = db,
): Promise<{ token: string; expiresAt: Date }> {
  const { plaintext, hash } = issueToken()
  const expiresAt = new Date(now.getTime() + ACTIVATION_TOKEN_TTL_DAYS * MS_PER_DAY)

  await executor
    .update(userActivationToken)
    .set({ usedAt: now, updatedAt: now })
    .where(and(eq(userActivationToken.userId, userId), isNull(userActivationToken.usedAt)))

  await executor.insert(userActivationToken).values({
    id: newId(),
    userId,
    tokenHash: hash,
    expiresAt,
    usedAt: null,
    createdBy: issuedBy,
    createdAt: now,
    updatedAt: now,
  })

  securityLogger.info(
    { userId, issuedBy, token: tokenPrefix(plaintext) },
    'activation token issued',
  )

  return { token: plaintext, expiresAt }
}

/**
 * Reports whether a token can be presented on the activation screen.
 *
 * Read-only: it decides which screen to render. Consumption happens separately
 * and transactionally, so a token checked here cannot be treated as claimed.
 */
export async function checkActivationToken(token: string, now: Date): Promise<TokenCheck> {
  const row = await db.query.userActivationToken.findFirst({
    where: eq(userActivationToken.tokenHash, hashToken(token)),
    columns: { userId: true, expiresAt: true, usedAt: true },
    with: { user: { columns: { email: true, name: true, status: true } } },
  })

  if (!row) return { ok: false, reason: 'INVALID' }

  const usable = isTokenUsable({ expiresAt: row.expiresAt, usedAt: row.usedAt }, now)
  if (!usable.ok) {
    return { ok: false, reason: row.usedAt !== null ? 'ALREADY_USED' : 'EXPIRED' }
  }

  const user = row.user as { email: string; name: string; status: UserStatus } | undefined
  if (!user || user.status !== 'PENDING_ACTIVATION') {
    return { ok: false, reason: 'ALREADY_USED' }
  }

  return { ok: true, userId: row.userId, email: user.email, name: user.name }
}

/**
 * Claims a token for use.
 *
 * The update is conditional on the token still being unused, and the caller must
 * check the affected row count: two requests arriving together would both pass a
 * prior read, and only the one whose UPDATE matched may proceed.
 */
export async function claimActivationToken(
  token: string,
  now: Date,
  executor: DbOrTx,
): Promise<{ userId: string } | null> {
  const hash = hashToken(token)

  const row = await executor.query.userActivationToken.findFirst({
    where: and(eq(userActivationToken.tokenHash, hash), isNull(userActivationToken.usedAt)),
    columns: { id: true, userId: true, expiresAt: true, usedAt: true },
  })

  if (!row) return null
  if (!isTokenUsable({ expiresAt: row.expiresAt, usedAt: row.usedAt }, now).ok) return null

  const [result] = await executor
    .update(userActivationToken)
    .set({ usedAt: now, updatedAt: now })
    .where(and(eq(userActivationToken.id, row.id), isNull(userActivationToken.usedAt)))

  if (result.affectedRows !== 1) return null

  return { userId: row.userId }
}

/** Marks an account active once its activation token has been claimed. */
export async function markAccountActivated(
  userId: string,
  now: Date,
  executor: DbOrTx,
): Promise<void> {
  await executor
    .update(authUser)
    .set({ status: 'ACTIVE', emailVerified: true, updatedAt: now })
    .where(eq(authUser.id, userId))
}

/** Housekeeping for the worker: drops tokens that can no longer be used. */
export async function deleteExpiredActivationTokens(now: Date): Promise<number> {
  const [result] = await db
    .delete(userActivationToken)
    .where(and(isNull(userActivationToken.usedAt), lt(userActivationToken.expiresAt, now)))

  return result.affectedRows
}

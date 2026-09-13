import { type Result, fail, ok } from '@/lib/result'
import type { UserStatus } from './types'

/**
 * Identity business rules.
 *
 * Pure predicates, separated from the data layer so they can be exhaustively
 * tested without a database and reused by both the action layer and the UI to
 * decide what to offer.
 *
 * Each returns a Result rather than throwing, so a caller can evaluate several
 * and present every problem at once.
 */
export function canIssueActivationLink(status: UserStatus): Result<void> {
  if (status === 'ACTIVE') return fail('identity.errors.accountAlreadyActive')
  if (status === 'DISABLED') return fail('identity.errors.accountDisabled')
  return ok()
}

export function canActivateAccount(status: UserStatus): Result<void> {
  if (status !== 'PENDING_ACTIVATION') return fail('identity.errors.accountAlreadyActive')
  return ok()
}

export function canSignIn(status: UserStatus): Result<void> {
  if (status !== 'ACTIVE') return fail('identity.errors.invalidCredentials')
  return ok()
}

/** Password reset is only meaningful for an account that has a password. */
export function canResetPassword(status: UserStatus): Result<void> {
  if (status !== 'ACTIVE') return fail('identity.errors.invalidCredentials')
  return ok()
}

/**
 * An administrator must not disable or demote their own account.
 *
 * Without this an administrator can lock themselves out, and in a deployment
 * with one administrator that means losing the only way back in.
 */
export function canChangeOwnAccountState(actorId: string, targetId: string): Result<void> {
  if (actorId === targetId) return fail('identity.errors.cannotChangeOwnAccount')
  return ok()
}

/**
 * Reports whether a token is still usable at a given instant.
 *
 * Time is a parameter rather than read from the clock so that expiry can be
 * tested at exact boundaries.
 */
export function isTokenUsable(
  token: { expiresAt: Date; usedAt: Date | null },
  now: Date,
): Result<void> {
  if (token.usedAt !== null) return fail('identity.errors.tokenAlreadyUsed')
  if (token.expiresAt.getTime() <= now.getTime()) return fail('identity.errors.tokenExpired')
  return ok()
}

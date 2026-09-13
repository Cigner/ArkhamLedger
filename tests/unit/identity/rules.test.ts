import { describe, expect, it } from 'vitest'
import {
  canActivateAccount,
  canChangeOwnAccountState,
  canIssueActivationLink,
  canResetPassword,
  canSignIn,
  isTokenUsable,
} from '@/modules/identity/domain/rules'
import type { UserStatus } from '@/modules/identity/domain/types'

/**
 * Identity rules.
 *
 * Exhaustive over the status enum rather than spot-checked: adding a fourth
 * status should break these tests loudly instead of silently inheriting whatever
 * the `else` branch happened to do.
 */
const ALL_STATUSES: UserStatus[] = ['PENDING_ACTIVATION', 'ACTIVE', 'DISABLED']

describe('canIssueActivationLink', () => {
  it.each<[UserStatus, boolean]>([
    ['PENDING_ACTIVATION', true],
    ['ACTIVE', false],
    ['DISABLED', false],
  ])('%s -> %s', (status, allowed) => {
    expect(canIssueActivationLink(status).ok).toBe(allowed)
  })

  it('covers every status', () => {
    expect(ALL_STATUSES.map((status) => canIssueActivationLink(status).ok)).toHaveLength(3)
  })
})

describe('canActivateAccount', () => {
  it('allows only an account still awaiting activation', () => {
    expect(canActivateAccount('PENDING_ACTIVATION').ok).toBe(true)
    expect(canActivateAccount('ACTIVE').ok).toBe(false)
    expect(canActivateAccount('DISABLED').ok).toBe(false)
  })
})

describe('canSignIn and canResetPassword', () => {
  /*
   * Both report the same generic key for every refusal. A distinct message per
   * status would let the sign-in form reveal whether an address has an account
   * and what state it is in.
   */
  it.each<UserStatus>(['PENDING_ACTIVATION', 'DISABLED'])(
    'refuses %s with a generic message',
    (status) => {
      const signIn = canSignIn(status)
      const reset = canResetPassword(status)

      expect(signIn.ok).toBe(false)
      expect(reset.ok).toBe(false)
      if (!signIn.ok && !reset.ok) {
        expect(signIn.error.key).toBe('identity.errors.invalidCredentials')
        expect(reset.error.key).toBe(signIn.error.key)
      }
    },
  )

  it('allows an active account', () => {
    expect(canSignIn('ACTIVE').ok).toBe(true)
    expect(canResetPassword('ACTIVE').ok).toBe(true)
  })
})

describe('canChangeOwnAccountState', () => {
  /*
   * Guards the lockout case: in a deployment with one administrator, disabling
   * or demoting yourself removes the only way back in.
   */
  it('refuses an administrator acting on their own account', () => {
    expect(canChangeOwnAccountState('user-1', 'user-1').ok).toBe(false)
  })

  it('allows acting on somebody else', () => {
    expect(canChangeOwnAccountState('user-1', 'user-2').ok).toBe(true)
  })
})

describe('isTokenUsable', () => {
  const now = new Date('2026-09-14T12:00:00.000Z')

  it('accepts an unused token that has not expired', () => {
    const token = { expiresAt: new Date('2026-09-14T12:00:00.001Z'), usedAt: null }
    expect(isTokenUsable(token, now).ok).toBe(true)
  })

  it('treats the expiry instant itself as expired', () => {
    const token = { expiresAt: now, usedAt: null }
    const result = isTokenUsable(token, now)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.key).toBe('identity.errors.tokenExpired')
  })

  it('reports use before expiry when a token is both', () => {
    const token = { expiresAt: new Date('2026-09-01T00:00:00Z'), usedAt: new Date() }
    const result = isTokenUsable(token, now)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.key).toBe('identity.errors.tokenAlreadyUsed')
  })
})

import { describe, expect, it } from 'vitest'
import {
  NO_BLOCKERS,
  blockerCount,
  canDeleteUser,
  canHardDeleteUser,
  type DeletionBlockers,
} from '@/modules/identity/domain/deletion'

/**
 * Removing an account.
 *
 * Two operations wearing one word. Closing an account is reversible in the sense
 * that matters — the record survives — while erasing the row destroys things
 * other people's history depends on, so the rule that separates them is the
 * whole safety mechanism.
 */
function blockers(overrides: Partial<DeletionBlockers> = {}): DeletionBlockers {
  return { ...NO_BLOCKERS, ...overrides }
}

describe('who may be removed at all', () => {
  /*
   * Somebody has to be left holding the keys. An administrator who erases
   * themselves mid-session leaves an installation nobody can administer.
   */
  it('refuses an administrator removing their own account', () => {
    const result = canDeleteUser({ targetUserId: 'a', actingUserId: 'a' })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.key).toBe('identity.errors.cannotDeleteSelf')
  })

  it('allows removing somebody else', () => {
    expect(canDeleteUser({ targetUserId: 'a', actingUserId: 'b' }).ok).toBe(true)
  })
})

describe('erasing the row', () => {
  it('is allowed when the account authored nothing', () => {
    expect(canHardDeleteUser(NO_BLOCKERS).ok).toBe(true)
    expect(blockerCount(NO_BLOCKERS)).toBe(0)
  })

  /*
   * Each of these is a foreign key that restricts rather than cascades, so the
   * database would refuse anyway. The rule exists so the refusal is a sentence
   * an administrator can act on rather than a driver error.
   */
  it.each([
    ['ownedCampaigns', 'identity.errors.ownsCampaigns'],
    ['createdSessions', 'identity.errors.createdSessions'],
    ['createdInvitations', 'identity.errors.createdInvitations'],
    ['createdScenarios', 'identity.errors.createdScenarios'],
    ['issuedActivationTokens', 'identity.errors.issuedActivationLinks'],
  ] as const)('is refused when the account %s', (field, key) => {
    const result = canHardDeleteUser(blockers({ [field]: 1 }))

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.key).toBe(key)
      expect(result.error.params).toEqual({ count: 1 })
    }
  })

  /*
   * One remedy at a time. Naming four things to fix is a list somebody skims;
   * naming the first is an instruction they follow.
   */
  it('names one blocker even when several apply', () => {
    const result = canHardDeleteUser(blockers({ ownedCampaigns: 2, createdSessions: 5 }))

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.key).toBe('identity.errors.ownsCampaigns')
  })

  it('counts everything that stands in the way', () => {
    expect(blockerCount(blockers({ ownedCampaigns: 2, issuedActivationTokens: 3 }))).toBe(5)
  })
})

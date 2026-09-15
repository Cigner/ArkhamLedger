import { type Result, fail, ok } from '@/lib/result'

/**
 * What stands in the way of erasing an account.
 *
 * Two kinds of removal, and the distinction matters more than it looks.
 *
 * Soft removal is always available: the account is closed, its sessions are
 * revoked and its memberships end, but every row it left behind stays. Who
 * played which session and who said they were free is a record of what the
 * group did, and it belongs to the group as much as to the person.
 *
 * Hard removal erases the row itself and everything that cascades from it. It is
 * refused whenever anything the person *authored* would have to be destroyed or
 * orphaned with it — a campaign they own, a session they created, an invitation
 * they issued. Those belong to other people's history, and the database says so
 * too: each of those foreign keys restricts, so an attempted delete would fail
 * mid-transaction rather than quietly cascade.
 *
 * "Paranoid" is the right word for the check. The counts below are recomputed on
 * the server at the moment of deletion, never trusted from the form that
 * offered the choice.
 */
export type DeletionBlockers = {
  readonly ownedCampaigns: number
  readonly createdSessions: number
  readonly createdInvitations: number
  readonly createdScenarios: number
  readonly issuedActivationTokens: number
}

export const NO_BLOCKERS: DeletionBlockers = {
  ownedCampaigns: 0,
  createdSessions: 0,
  createdInvitations: 0,
  createdScenarios: 0,
  issuedActivationTokens: 0,
}

export function blockerCount(blockers: DeletionBlockers): number {
  return (
    blockers.ownedCampaigns +
    blockers.createdSessions +
    blockers.createdInvitations +
    blockers.createdScenarios +
    blockers.issuedActivationTokens
  )
}

/**
 * Whether the row itself may be erased.
 *
 * Returns the first blocker rather than a list: the remedy differs per kind —
 * transfer a campaign, cancel a session — and naming one thing to do is more
 * use than naming four.
 */
export function canHardDeleteUser(blockers: DeletionBlockers): Result<void> {
  if (blockers.ownedCampaigns > 0) {
    return fail('identity.errors.ownsCampaigns', { count: blockers.ownedCampaigns })
  }
  if (blockers.createdSessions > 0) {
    return fail('identity.errors.createdSessions', { count: blockers.createdSessions })
  }
  if (blockers.createdInvitations > 0) {
    return fail('identity.errors.createdInvitations', { count: blockers.createdInvitations })
  }
  if (blockers.createdScenarios > 0) {
    return fail('identity.errors.createdScenarios', { count: blockers.createdScenarios })
  }
  if (blockers.issuedActivationTokens > 0) {
    return fail('identity.errors.issuedActivationLinks', {
      count: blockers.issuedActivationTokens,
    })
  }
  return ok()
}

/**
 * Whether an administrator may remove this account at all.
 *
 * Removing your own is refused in either form. Somebody has to be left holding
 * the keys, and an administrator who erases themselves mid-session leaves an
 * installation nobody can administer.
 */
export function canDeleteUser(input: {
  readonly targetUserId: string
  readonly actingUserId: string
}): Result<void> {
  if (input.targetUserId === input.actingUserId) {
    return fail('identity.errors.cannotDeleteSelf')
  }
  return ok()
}

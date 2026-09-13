import { type Result, fail, ok } from '@/lib/result'
import type { CampaignRole, CampaignStatus, Membership, MembershipStatus } from './types'

/**
 * Campaign business rules.
 *
 * Pure predicates over already-loaded state. Keeping them here means the UI can
 * ask the same questions the actions enforce, so a button is never offered for
 * something the server will refuse.
 */
const ROLE_RANK: Record<CampaignRole, number> = { INVESTIGATOR: 0, KEEPER: 1 }

export function roleAtLeast(actual: CampaignRole, required: CampaignRole): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[required]
}

export function canManageCampaign(viewer: Membership): Result<void> {
  if (!roleAtLeast(viewer.role, 'KEEPER')) return fail('campaigns.errors.keeperOnly')
  return ok()
}

export function canArchiveCampaign(viewer: Membership): Result<void> {
  if (!viewer.isOwner) return fail('campaigns.errors.ownerOnly')
  return ok()
}

/**
 * The owner cannot walk away from a campaign.
 *
 * Leaving would orphan it — nobody could archive it or manage membership — so
 * ownership has to be handed over first. Surfacing that as a rule rather than a
 * silent failure lets the UI point at the fix.
 */
export function canLeaveCampaign(viewer: Membership): Result<void> {
  if (viewer.isOwner) return fail('campaigns.errors.ownerMustTransferFirst')
  return ok()
}

export function canRemoveMember(viewer: Membership, targetUserId: string): Result<void> {
  if (!viewer.isOwner) return fail('campaigns.errors.ownerOnly')
  if (viewer.userId === targetUserId) return fail('campaigns.errors.cannotRemoveSelf')
  return ok()
}

export function canChangeMemberRole(viewer: Membership, targetUserId: string): Result<void> {
  if (!viewer.isOwner) return fail('campaigns.errors.ownerOnly')
  // The owner is a Keeper by definition; demoting themselves would leave the
  // campaign owned by somebody who cannot manage it.
  if (viewer.userId === targetUserId) return fail('campaigns.errors.cannotChangeOwnRole')
  return ok()
}

/**
 * Ownership may only pass to somebody already in the campaign.
 *
 * Transferring to an outsider would either create a member implicitly or leave
 * an owner who is not a member at all; both are worse than refusing.
 */
export function canTransferOwnership(
  viewer: Membership,
  target: { userId: string; status: MembershipStatus } | null,
): Result<void> {
  if (!viewer.isOwner) return fail('campaigns.errors.ownerOnly')
  if (!target || target.status !== 'ACTIVE') return fail('campaigns.errors.newOwnerMustBeMember')
  if (target.userId === viewer.userId) return fail('campaigns.errors.alreadyOwner')
  return ok()
}

/**
 * A campaign that has been archived is read-only.
 *
 * Checked separately from role so the message can say why, rather than looking
 * like a permission problem.
 */
export function canModifyContent(status: CampaignStatus): Result<void> {
  if (status === 'ARCHIVED') return fail('campaigns.errors.campaignArchived')
  return ok()
}

/** A campaign needs at least one Keeper to run sessions. */
export function wouldLeaveNoKeeper(
  members: readonly { userId: string; role: CampaignRole }[],
  changingUserId: string,
  newRole: CampaignRole | null,
): boolean {
  const remaining = members.filter((member) =>
    member.userId === changingUserId ? newRole === 'KEEPER' : member.role === 'KEEPER',
  )
  return remaining.length === 0
}

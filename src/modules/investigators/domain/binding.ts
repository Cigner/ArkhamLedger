import { type Result, fail, ok } from '@/lib/result'
import type { InvestigatorStatus } from './lifecycle'

/**
 * A character's relationship with a campaign.
 *
 * Linking is about availability, not ownership: the campaign gains the right to
 * see and assign the character, and the owner keeps everything else. That
 * separation is why a Keeper never reaches the rest of somebody's Vault - they
 * can only ever act on what has been brought into their campaign.
 */
export type BindingCandidate = {
  readonly status: InvestigatorStatus
  readonly archivedAt: Date | null
  /** Whether the character's owner is an active member of that campaign. */
  readonly ownerIsMember: boolean
  readonly alreadyLinked: boolean
}

/**
 * Whether a character may be brought into a campaign.
 *
 * A draft is allowed on purpose. Somebody joining a new game writes their
 * character for it, and refusing the link until the sheet is finished would
 * mean the Keeper cannot see it take shape. What a draft may not do is be
 * played, which is enforced where that actually happens.
 */
export function canLinkToCampaign(candidate: BindingCandidate): Result<void> {
  if (candidate.archivedAt !== null) return fail('investigators.errors.archived')
  if (candidate.status === 'DECEASED') return fail('investigators.errors.deceased')
  if (!candidate.ownerIsMember) return fail('investigators.errors.ownerNotInCampaign')
  if (candidate.alreadyLinked) return fail('investigators.errors.alreadyLinked')
  return ok()
}

/**
 * Whether a character may be chosen for a session.
 *
 * Stricter than linking, because this is the moment the sheet has to be a
 * character rather than an intention. A retired or dead Investigator stays
 * visible in the campaign's history but cannot be picked for a new evening.
 */
export function canAssignToSession(candidate: {
  readonly status: InvestigatorStatus
  readonly archivedAt: Date | null
  readonly linkedToCampaign: boolean
}): Result<void> {
  if (!candidate.linkedToCampaign) return fail('investigators.errors.notInCampaign')
  if (candidate.archivedAt !== null) return fail('investigators.errors.archived')
  if (candidate.status === 'DRAFT') return fail('investigators.errors.stillADraft')
  if (candidate.status === 'RETIRED') return fail('investigators.errors.retired')
  if (candidate.status === 'DECEASED') return fail('investigators.errors.deceased')
  return ok()
}

/**
 * Whether the same character can be played in two places at once.
 *
 * It cannot. One sheet, one set of hit points: a character in two live sessions
 * would have its resources changed from two tables with no way to reconcile
 * them. Separate timelines are what the lineage branch is for, and the refusal
 * says which session is holding it so the Keeper can go and finish that one.
 */
export function canPlayConcurrently(input: {
  readonly liveSessionTitle: string | null
}): Result<void> {
  if (input.liveSessionTitle === null) return ok()
  return fail('investigators.errors.alreadyInPlay', { session: input.liveSessionTitle })
}

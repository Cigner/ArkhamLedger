import { type Result, fail, ok } from '@/lib/result'

/**
 * Who may do what to an Investigator.
 *
 * The permission matrix is data rather than a chain of conditionals, for the
 * same reason the session lifecycle table is: it can be read in one sitting,
 * tested exhaustively, and compared against the written rule without tracing
 * branches. Every cell here corresponds to a row of the permission table in
 * docs/product/investigator-management-plan.md.
 *
 * Two roles need care. A creating Keeper is not a Keeper with extra rights - it
 * is a temporary stand-in for the owner, and it expires the first time the
 * character is played. An ordinary Keeper never edits a sheet at all; they run
 * the game the sheet appears in, which is a different job.
 */
export type InvestigatorRole = 'OWNER' | 'CREATOR_KEEPER' | 'KEEPER' | 'PLAYER' | 'HISTORICAL'

export type InvestigatorOperation =
  | 'VIEW_CURRENT'
  | 'VIEW_FULL'
  | 'EDIT_SHEET'
  | 'CONFIGURE_PRIVACY'
  | 'ASSIGN_TO_SESSION'
  | 'WRITE_KEEPER_NOTE'
  | 'WRITE_OBSERVATION'
  | 'REQUEST_TRANSFER'
  | 'APPROVE_TRANSFER'

const PERMISSIONS: Readonly<Record<InvestigatorOperation, readonly InvestigatorRole[]>> = {
  VIEW_CURRENT: ['OWNER', 'CREATOR_KEEPER', 'KEEPER', 'PLAYER'],
  VIEW_FULL: ['OWNER', 'CREATOR_KEEPER', 'KEEPER'],
  EDIT_SHEET: ['OWNER', 'CREATOR_KEEPER'],
  CONFIGURE_PRIVACY: ['OWNER', 'CREATOR_KEEPER'],
  ASSIGN_TO_SESSION: ['CREATOR_KEEPER', 'KEEPER'],
  WRITE_KEEPER_NOTE: ['CREATOR_KEEPER', 'KEEPER'],
  WRITE_OBSERVATION: ['OWNER', 'CREATOR_KEEPER', 'KEEPER', 'PLAYER'],
  REQUEST_TRANSFER: ['CREATOR_KEEPER', 'KEEPER'],
  APPROVE_TRANSFER: ['OWNER'],
}

/**
 * What a viewer is to this Investigator right now.
 *
 * Every field is a fact the data layer has already established, so that this
 * stays a decision and not a query. `historicalAccess` is the one that keeps the
 * permanent-access promise: it survives the campaign ending, and it never grows
 * into a live role.
 */
export type InvestigatorViewer = {
  readonly viewerId: string
  readonly ownerId: string
  /** An open creator grant: the Keeper who made this sheet, before its first use. */
  readonly hasOpenEditGrant: boolean
  /** Keeps a campaign the Investigator is actively linked to. */
  readonly keepsLinkedCampaign: boolean
  /** Plays in a campaign the Investigator is actively linked to. */
  readonly playsLinkedCampaign: boolean
  /** Holds a disclosure from access that has since ended. */
  readonly hasHistoricalAccess: boolean
}

/**
 * The strongest role a viewer holds, or null for no access at all.
 *
 * Ordered, because roles overlap in practice: a Keeper who plays their own
 * character in another campaign is its owner there, and a former player of an
 * ended campaign still holds what they were shown. Resolving to the strongest
 * means a person is never refused something a weaker reading of them allowed.
 */
export function resolveRole(viewer: InvestigatorViewer): InvestigatorRole | null {
  if (viewer.viewerId === viewer.ownerId) return 'OWNER'
  if (viewer.hasOpenEditGrant) return 'CREATOR_KEEPER'
  if (viewer.keepsLinkedCampaign) return 'KEEPER'
  if (viewer.playsLinkedCampaign) return 'PLAYER'
  if (viewer.hasHistoricalAccess) return 'HISTORICAL'
  return null
}

export function permits(role: InvestigatorRole | null, operation: InvestigatorOperation): boolean {
  return role !== null && PERMISSIONS[operation].includes(role)
}

/**
 * The same decision as a Result, for callers that report rather than branch.
 *
 * Refusal is deliberately one message for every operation: telling somebody
 * which specific right they lack is how a permission check becomes a way to
 * enumerate what exists.
 */
export function requirePermission(
  role: InvestigatorRole | null,
  operation: InvestigatorOperation,
): Result<void> {
  return permits(role, operation) ? ok() : fail('investigators.errors.notAllowed')
}

/**
 * Whether a creating Keeper's grant is still open.
 *
 * It closes at first use rather than at session end or after a delay: the moment
 * a character is played it stops being a draft somebody made for you and starts
 * being yours. An already-closed grant never reopens, so this reads as a
 * one-way door.
 */
export function editGrantRemainsOpen(grant: {
  readonly closedAt: Date | null
  readonly keeperStillKeepsCampaign: boolean
  readonly investigatorFirstUsedAt: Date | null
}): boolean {
  return (
    grant.closedAt === null &&
    grant.investigatorFirstUsedAt === null &&
    grant.keeperStillKeepsCampaign
  )
}

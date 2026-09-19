import { type Result, fail, ok } from '@/lib/result'
import type { InvestigatorStatus } from './lifecycle'

/**
 * Handing a character to another player.
 *
 * The rule the whole design turns on: nobody loses what they already had. The
 * new owner does not receive the sheet, they receive a continuation of it - a
 * new branch of the same lineage - and the version the previous owner played
 * stays with them exactly as it was.
 *
 * That is what keeps a transfer in one campaign from changing anything in
 * another. A character played in two games is two branches after the transfer,
 * and the game that did not transfer never notices.
 */
export type TransferStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED'

const TRANSITIONS = {
  PENDING: ['ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED'],
  ACCEPTED: [],
  REJECTED: [],
  EXPIRED: [],
  CANCELLED: [],
} as const satisfies Readonly<Record<TransferStatus, readonly TransferStatus[]>>

export function transitionTransfer(from: TransferStatus, to: TransferStatus): Result<void> {
  const allowed: readonly TransferStatus[] = TRANSITIONS[from]
  if (!allowed.includes(to)) return fail('investigators.errors.transferAlreadyDecided')
  return ok()
}

export type TransferRequest = {
  readonly investigatorStatus: InvestigatorStatus
  readonly archivedAt: Date | null
  readonly currentOwnerId: string
  readonly newOwnerId: string
  readonly newOwnerIsCampaignMember: boolean
  readonly linkedToCampaign: boolean
  readonly hasPendingTransfer: boolean
}

/**
 * Whether a transfer may be asked for.
 *
 * A dead character can still be handed over: somebody inheriting a body and a
 * notebook is a scene this game runs on. What cannot be transferred is a
 * character that was never in the campaign doing the asking, or one already in
 * the middle of being handed to somebody else.
 */
export function canRequestTransfer(request: TransferRequest): Result<void> {
  if (request.archivedAt !== null) return fail('investigators.errors.archived')
  if (!request.linkedToCampaign) return fail('investigators.errors.notInCampaign')
  if (request.currentOwnerId === request.newOwnerId) {
    return fail('investigators.errors.alreadyTheirs')
  }
  if (!request.newOwnerIsCampaignMember) {
    return fail('investigators.errors.newOwnerNotInCampaign')
  }
  if (request.hasPendingTransfer) return fail('investigators.errors.transferAlreadyPending')
  return ok()
}

/**
 * Whether a pending request may still be acted on.
 *
 * Expiry is checked against the clock passed in rather than read, so a request
 * that lapsed while somebody had the page open is refused on the same terms
 * wherever it is evaluated.
 */
export function canDecideTransfer(input: {
  readonly status: TransferStatus
  readonly expiresAt: Date
  readonly now: Date
}): Result<void> {
  if (input.status !== 'PENDING') return fail('investigators.errors.transferAlreadyDecided')
  if (input.expiresAt.getTime() <= input.now.getTime()) {
    return fail('investigators.errors.transferExpired')
  }
  return ok()
}

/** How long a request waits before it lapses. */
export const TRANSFER_EXPIRY_DAYS = 14

export function transferExpiryFrom(now: Date): Date {
  return new Date(now.getTime() + TRANSFER_EXPIRY_DAYS * 24 * 60 * 60 * 1000)
}

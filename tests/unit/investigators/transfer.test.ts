import { describe, expect, it } from 'vitest'
import {
  type TransferRequest,
  type TransferStatus,
  TRANSFER_EXPIRY_DAYS,
  canDecideTransfer,
  canRequestTransfer,
  transferExpiryFrom,
  transitionTransfer,
} from '@/modules/investigators/domain/transfer'

/**
 * Transfer rules.
 *
 * A request is a question, so most of what is checked here is that it can only
 * be answered once and only while it is still open.
 */
const NOW = new Date('2026-09-14T12:00:00.000Z')

const ALL_STATUSES: readonly TransferStatus[] = [
  'PENDING',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED',
  'CANCELLED',
]

function request(overrides: Partial<TransferRequest> = {}): TransferRequest {
  return {
    investigatorStatus: 'ACTIVE',
    archivedAt: null,
    currentOwnerId: 'owner',
    newOwnerId: 'other',
    newOwnerIsCampaignMember: true,
    linkedToCampaign: true,
    hasPendingTransfer: false,
    ...overrides,
  }
}

describe('transitionTransfer', () => {
  it.each(ALL_STATUSES)('a %s request cannot be decided again', (status) => {
    const decided = status !== 'PENDING'
    expect(transitionTransfer(status, 'ACCEPTED').ok).toBe(!decided)
  })

  it('lets a pending request end any of the four ways', () => {
    for (const outcome of ['ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED'] as const) {
      expect(transitionTransfer('PENDING', outcome).ok).toBe(true)
    }
  })
})

describe('canRequestTransfer', () => {
  it('allows the ordinary case', () => {
    expect(canRequestTransfer(request()).ok).toBe(true)
  })

  /*
   * Inheriting a dead colleague's character is a scene this game runs on, so
   * death is not a bar. Being archived is: that character has been put away.
   */
  it('allows a character who has died', () => {
    expect(canRequestTransfer(request({ investigatorStatus: 'DECEASED' })).ok).toBe(true)
  })

  it('refuses an archived character', () => {
    expect(canRequestTransfer(request({ archivedAt: NOW })).ok).toBe(false)
  })

  it('refuses a character that is not in the campaign doing the asking', () => {
    const result = canRequestTransfer(request({ linkedToCampaign: false }))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.key).toBe('investigators.errors.notInCampaign')
  })

  it('refuses handing a character to the person who already owns it', () => {
    expect(canRequestTransfer(request({ newOwnerId: 'owner' })).ok).toBe(false)
  })

  it('refuses a recipient who is not in the campaign', () => {
    expect(canRequestTransfer(request({ newOwnerIsCampaignMember: false })).ok).toBe(false)
  })

  /*
   * One at a time. Two open requests for the same character would race each
   * other, and whichever was accepted second would branch from a character that
   * had already moved.
   */
  it('refuses a second request while one is open', () => {
    const result = canRequestTransfer(request({ hasPendingTransfer: true }))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.key).toBe('investigators.errors.transferAlreadyPending')
  })
})

describe('canDecideTransfer', () => {
  const expiresAt = transferExpiryFrom(NOW)

  it('allows an answer while it is open', () => {
    expect(canDecideTransfer({ status: 'PENDING', expiresAt, now: NOW }).ok).toBe(true)
  })

  it('refuses once it has lapsed', () => {
    const result = canDecideTransfer({
      status: 'PENDING',
      expiresAt,
      now: new Date(expiresAt.getTime()),
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.key).toBe('investigators.errors.transferExpired')
  })

  it('refuses a request already answered', () => {
    expect(canDecideTransfer({ status: 'ACCEPTED', expiresAt, now: NOW }).ok).toBe(false)
  })

  it('lapses after the stated number of days', () => {
    const expected = NOW.getTime() + TRANSFER_EXPIRY_DAYS * 24 * 60 * 60 * 1000
    expect(transferExpiryFrom(NOW).getTime()).toBe(expected)
  })
})

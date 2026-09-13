import { describe, expect, it } from 'vitest'
import {
  canArchiveCampaign,
  canChangeMemberRole,
  canLeaveCampaign,
  canManageCampaign,
  canModifyContent,
  canRemoveMember,
  canTransferOwnership,
  roleAtLeast,
  wouldLeaveNoKeeper,
} from '@/modules/campaigns/domain/rules'
import type { CampaignRole, Membership } from '@/modules/campaigns/domain/types'

/**
 * Campaign rules.
 *
 * The interesting cases are the ones that protect the campaign from becoming
 * unmanageable: an owner who leaves, a last Keeper who is demoted, an owner who
 * demotes themselves. Each is easy to reach through the UI and impossible to
 * recover from without database access.
 */
function membership(overrides: Partial<Membership> = {}): Membership {
  return {
    campaignId: 'campaign-1',
    userId: 'user-1',
    role: 'KEEPER',
    isOwner: false,
    ...overrides,
  }
}

describe('roleAtLeast', () => {
  it.each<[CampaignRole, CampaignRole, boolean]>([
    ['KEEPER', 'KEEPER', true],
    ['KEEPER', 'INVESTIGATOR', true],
    ['INVESTIGATOR', 'INVESTIGATOR', true],
    ['INVESTIGATOR', 'KEEPER', false],
  ])('%s satisfies %s -> %s', (actual, required, expected) => {
    expect(roleAtLeast(actual, required)).toBe(expected)
  })
})

describe('canManageCampaign', () => {
  it('allows a Keeper and refuses an Investigator', () => {
    expect(canManageCampaign(membership({ role: 'KEEPER' })).ok).toBe(true)
    expect(canManageCampaign(membership({ role: 'INVESTIGATOR' })).ok).toBe(false)
  })
})

describe('canArchiveCampaign', () => {
  it('is owner-only, even for a Keeper', () => {
    expect(canArchiveCampaign(membership({ isOwner: true })).ok).toBe(true)
    expect(canArchiveCampaign(membership({ role: 'KEEPER', isOwner: false })).ok).toBe(false)
  })
})

describe('canLeaveCampaign', () => {
  /*
   * An owner who leaves orphans the campaign: nobody could archive it or manage
   * membership afterwards. The refusal names the fix rather than just denying.
   */
  it('refuses the owner and points at transferring first', () => {
    const result = canLeaveCampaign(membership({ isOwner: true }))

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.key).toBe('campaigns.errors.ownerMustTransferFirst')
  })

  it('allows anyone else', () => {
    expect(canLeaveCampaign(membership({ role: 'KEEPER' })).ok).toBe(true)
    expect(canLeaveCampaign(membership({ role: 'INVESTIGATOR' })).ok).toBe(true)
  })
})

describe('canRemoveMember', () => {
  it('is owner-only', () => {
    expect(canRemoveMember(membership({ role: 'KEEPER' }), 'user-2').ok).toBe(false)
    expect(canRemoveMember(membership({ isOwner: true }), 'user-2').ok).toBe(true)
  })

  it('refuses removing yourself, which is what leaving is for', () => {
    expect(canRemoveMember(membership({ isOwner: true }), 'user-1').ok).toBe(false)
  })
})

describe('canChangeMemberRole', () => {
  it('is owner-only', () => {
    expect(canChangeMemberRole(membership({ role: 'KEEPER' }), 'user-2').ok).toBe(false)
    expect(canChangeMemberRole(membership({ isOwner: true }), 'user-2').ok).toBe(true)
  })

  it('refuses the owner demoting themselves', () => {
    expect(canChangeMemberRole(membership({ isOwner: true }), 'user-1').ok).toBe(false)
  })
})

describe('canTransferOwnership', () => {
  const owner = membership({ isOwner: true })

  it('requires the recipient to be an active member', () => {
    expect(canTransferOwnership(owner, null).ok).toBe(false)
    expect(canTransferOwnership(owner, { userId: 'user-2', status: 'LEFT' }).ok).toBe(false)
    expect(canTransferOwnership(owner, { userId: 'user-2', status: 'ACTIVE' }).ok).toBe(true)
  })

  it('refuses transferring to yourself', () => {
    expect(canTransferOwnership(owner, { userId: 'user-1', status: 'ACTIVE' }).ok).toBe(false)
  })

  it('refuses a non-owner', () => {
    expect(
      canTransferOwnership(membership({ role: 'KEEPER' }), { userId: 'user-2', status: 'ACTIVE' })
        .ok,
    ).toBe(false)
  })
})

describe('canModifyContent', () => {
  it('refuses only an archived campaign', () => {
    expect(canModifyContent('ARCHIVED').ok).toBe(false)
    expect(canModifyContent('PLANNING').ok).toBe(true)
    expect(canModifyContent('ACTIVE').ok).toBe(true)
    expect(canModifyContent('ON_HIATUS').ok).toBe(true)
    expect(canModifyContent('COMPLETED').ok).toBe(true)
  })
})

describe('wouldLeaveNoKeeper', () => {
  const members = [
    { userId: 'keeper-1', role: 'KEEPER' as const },
    { userId: 'keeper-2', role: 'KEEPER' as const },
    { userId: 'player-1', role: 'INVESTIGATOR' as const },
  ]

  it('allows demoting one of two Keepers', () => {
    expect(wouldLeaveNoKeeper(members, 'keeper-1', 'INVESTIGATOR')).toBe(false)
  })

  it('refuses demoting the last Keeper', () => {
    const single = [members[0]!, members[2]!]
    expect(wouldLeaveNoKeeper(single, 'keeper-1', 'INVESTIGATOR')).toBe(true)
  })

  it('refuses the last Keeper leaving', () => {
    const single = [members[0]!, members[2]!]
    expect(wouldLeaveNoKeeper(single, 'keeper-1', null)).toBe(true)
  })

  it('allows an Investigator to leave', () => {
    expect(wouldLeaveNoKeeper(members, 'player-1', null)).toBe(false)
  })

  it('allows promoting somebody when there is already a Keeper', () => {
    expect(wouldLeaveNoKeeper(members, 'player-1', 'KEEPER')).toBe(false)
  })
})

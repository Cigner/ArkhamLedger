import { describe, expect, it } from 'vitest'
import {
  type BindingCandidate,
  canAssignToSession,
  canLinkToCampaign,
  canPlayConcurrently,
} from '@/modules/investigators/domain/binding'

/**
 * Campaign bindings.
 *
 * Two thresholds, deliberately different. Joining a campaign is permissive
 * because that is how a character gets written at all; being played is strict
 * because that is the moment the sheet has to be finished.
 */
const ARCHIVED_AT = new Date('2026-09-01T00:00:00.000Z')

function candidate(overrides: Partial<BindingCandidate> = {}): BindingCandidate {
  return {
    status: 'ACTIVE',
    archivedAt: null,
    ownerIsMember: true,
    alreadyLinked: false,
    ...overrides,
  }
}

describe('canLinkToCampaign', () => {
  it('accepts an active character whose player is in the campaign', () => {
    expect(canLinkToCampaign(candidate()).ok).toBe(true)
  })

  /*
   * People write a character for the game they are about to join. Refusing the
   * link until the sheet is finished would hide it from the Keeper during the
   * only period when their help is useful.
   */
  it('accepts a draft', () => {
    expect(canLinkToCampaign(candidate({ status: 'DRAFT' })).ok).toBe(true)
  })

  it('accepts a retired character, which may be brought back', () => {
    expect(canLinkToCampaign(candidate({ status: 'RETIRED' })).ok).toBe(true)
  })

  it('refuses a character whose player is not in the campaign', () => {
    const result = canLinkToCampaign(candidate({ ownerIsMember: false }))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.key).toBe('investigators.errors.ownerNotInCampaign')
  })

  it('refuses the dead and the archived', () => {
    expect(canLinkToCampaign(candidate({ status: 'DECEASED' })).ok).toBe(false)
    expect(canLinkToCampaign(candidate({ archivedAt: ARCHIVED_AT })).ok).toBe(false)
  })

  it('refuses a second binding to the same campaign', () => {
    expect(canLinkToCampaign(candidate({ alreadyLinked: true })).ok).toBe(false)
  })
})

describe('canAssignToSession', () => {
  const assignable = { status: 'ACTIVE', archivedAt: null, linkedToCampaign: true } as const

  it('accepts an active character in the campaign', () => {
    expect(canAssignToSession(assignable).ok).toBe(true)
  })

  it('refuses a draft, which is the state linking deliberately allows', () => {
    const result = canAssignToSession({ ...assignable, status: 'DRAFT' })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.key).toBe('investigators.errors.stillADraft')
  })

  it('refuses the retired and the dead', () => {
    expect(canAssignToSession({ ...assignable, status: 'RETIRED' }).ok).toBe(false)
    expect(canAssignToSession({ ...assignable, status: 'DECEASED' }).ok).toBe(false)
  })

  it('refuses a character that is not in this campaign at all', () => {
    expect(canAssignToSession({ ...assignable, linkedToCampaign: false }).ok).toBe(false)
  })
})

describe('canPlayConcurrently', () => {
  it('allows a character nobody else is playing right now', () => {
    expect(canPlayConcurrently({ liveSessionTitle: null }).ok).toBe(true)
  })

  /*
   * The refusal names the session holding it. "That character is busy" sends a
   * Keeper hunting; naming the game tells them which table to go and finish.
   */
  it('names the session already playing it', () => {
    const result = canPlayConcurrently({ liveSessionTitle: 'Chapter Two' })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.key).toBe('investigators.errors.alreadyInPlay')
    expect(result.error.params).toEqual({ session: 'Chapter Two' })
  })
})

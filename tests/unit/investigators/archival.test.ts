import { describe, expect, it } from 'vitest'
import {
  canArchive,
  canPermanentlyDeleteInvestigator,
  canRestore,
  transitionInvestigator,
} from '@/modules/investigators/domain/lifecycle'

/**
 * Endings.
 *
 * Archiving and dying are different things and the rules treat them
 * differently: one is a filing decision that can be undone, the other is the
 * only state this module refuses to reverse.
 */
const ARCHIVED_AT = new Date('2026-09-14T12:00:00.000Z')

describe('transitions', () => {
  it('lets an active character retire and come back', () => {
    expect(transitionInvestigator('ACTIVE', 'RETIRED').ok).toBe(true)
    expect(transitionInvestigator('RETIRED', 'ACTIVE').ok).toBe(true)
  })

  it('lets an active character die', () => {
    expect(transitionInvestigator('ACTIVE', 'DECEASED').ok).toBe(true)
  })

  /*
   * The one door that does not open again. Everything else in this module is
   * reversible on purpose; this is the exception the rules insist on.
   */
  it('never brings the dead back', () => {
    for (const to of ['ACTIVE', 'RETIRED', 'DRAFT'] as const) {
      expect(transitionInvestigator('DECEASED', to).ok).toBe(false)
    }
  })

  it('never returns a finished character to a draft', () => {
    expect(transitionInvestigator('ACTIVE', 'DRAFT').ok).toBe(false)
  })
})

describe('canArchive', () => {
  it('accepts anything not already put away', () => {
    expect(canArchive({ archivedAt: null }).ok).toBe(true)
  })

  it('refuses a second time', () => {
    expect(canArchive({ archivedAt: ARCHIVED_AT }).ok).toBe(false)
  })
})

describe('canRestore', () => {
  it('brings back the living', () => {
    expect(canRestore({ archivedAt: ARCHIVED_AT, status: 'ACTIVE' }).ok).toBe(true)
    expect(canRestore({ archivedAt: ARCHIVED_AT, status: 'RETIRED' }).ok).toBe(true)
  })

  it('leaves the dead where they are', () => {
    const result = canRestore({ archivedAt: ARCHIVED_AT, status: 'DECEASED' })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.key).toBe('investigators.errors.deceasedStaysArchived')
  })

  it('refuses to restore something that was never archived', () => {
    expect(canRestore({ archivedAt: null, status: 'ACTIVE' }).ok).toBe(false)
  })
})

describe('canPermanentlyDeleteInvestigator', () => {
  const draft = { status: 'DRAFT', hasBeenShared: false, hasBeenUsed: false } as const

  it('allows a draft nobody has seen', () => {
    expect(canPermanentlyDeleteInvestigator(draft)).toBe(true)
  })

  /*
   * Each of these is somebody else's record. Deleting the character would take
   * it from them, which is why the answer is archival instead.
   */
  it('refuses once it has been shared or played', () => {
    expect(canPermanentlyDeleteInvestigator({ ...draft, hasBeenShared: true })).toBe(false)
    expect(canPermanentlyDeleteInvestigator({ ...draft, hasBeenUsed: true })).toBe(false)
  })

  it('refuses anything that is no longer a draft', () => {
    for (const status of ['ACTIVE', 'RETIRED', 'DECEASED'] as const) {
      expect(canPermanentlyDeleteInvestigator({ ...draft, status })).toBe(false)
    }
  })
})

import { describe, expect, it } from 'vitest'
import type { InvestigatorRole } from '@/modules/investigators/domain/access'
import {
  type NoteKind,
  type NoteVisibility,
  audienceLosingAccess,
  canReadNote,
  canWriteNote,
  isReduction,
  validateVisibility,
} from '@/modules/investigators/domain/notes'

/**
 * Notes.
 *
 * Two promises are being checked. A player's observation of somebody else's
 * character reaches nobody, ever, whatever is asked of it; and narrowing a
 * Keeper's note takes it away from the right people and only them.
 */
const ROLES: readonly InvestigatorRole[] = [
  'OWNER',
  'CREATOR_KEEPER',
  'KEEPER',
  'PLAYER',
  'HISTORICAL',
]

describe('canWriteNote', () => {
  it('lets only a Keeper write a Keeper note', () => {
    expect(canWriteNote('KEEPER', 'KEEPER').ok).toBe(true)
    expect(canWriteNote('CREATOR_KEEPER', 'KEEPER').ok).toBe(true)
    expect(canWriteNote('OWNER', 'KEEPER').ok).toBe(false)
    expect(canWriteNote('PLAYER', 'KEEPER').ok).toBe(false)
  })

  it('lets only the owner keep an owner note', () => {
    expect(canWriteNote('OWNER', 'OWNER_PRIVATE').ok).toBe(true)
    expect(canWriteNote('KEEPER', 'OWNER_PRIVATE').ok).toBe(false)
  })

  it('lets anybody who can see the character keep their own observations', () => {
    for (const role of ROLES) {
      expect(canWriteNote(role, 'PLAYER_OBSERVATION').ok).toBe(true)
    }
  })

  it('refuses everything to somebody with no standing at all', () => {
    for (const kind of ['OWNER_PRIVATE', 'KEEPER', 'PLAYER_OBSERVATION'] as NoteKind[]) {
      expect(canWriteNote(null, kind).ok).toBe(false)
    }
  })
})

describe('validateVisibility', () => {
  it('lets a Keeper note be shared three ways', () => {
    for (const visibility of ['KEEPERS', 'KEEPERS_AND_OWNER', 'CAMPAIGN'] as NoteVisibility[]) {
      expect(validateVisibility('KEEPER', visibility).ok).toBe(true)
    }
  })

  /*
   * An observation that could be shared would be a different feature. The plan
   * is explicit: it cannot be shared, which is why people write them honestly.
   */
  it('refuses to let an observation be shared', () => {
    for (const visibility of ['KEEPERS', 'KEEPERS_AND_OWNER', 'CAMPAIGN'] as NoteVisibility[]) {
      expect(validateVisibility('PLAYER_OBSERVATION', visibility).ok).toBe(false)
    }
    expect(validateVisibility('PLAYER_OBSERVATION', 'AUTHOR_ONLY').ok).toBe(true)
  })
})

describe('canReadNote', () => {
  const base = {
    viewerId: 'viewer',
    authorId: 'author',
  }

  it('always lets the author read their own', () => {
    expect(
      canReadNote({
        ...base,
        viewerId: 'author',
        kind: 'PLAYER_OBSERVATION',
        visibility: 'AUTHOR_ONLY',
        role: null,
      }),
    ).toBe(true)
  })

  it.each(ROLES)('never shows an observation to %s', (role) => {
    expect(
      canReadNote({
        ...base,
        kind: 'PLAYER_OBSERVATION',
        visibility: 'AUTHOR_ONLY',
        role,
      }),
    ).toBe(false)
  })

  it('shows a Keepers-only note to Keepers alone', () => {
    const shown = (role: InvestigatorRole) =>
      canReadNote({ ...base, kind: 'KEEPER', visibility: 'KEEPERS', role })

    expect(shown('KEEPER')).toBe(true)
    expect(shown('CREATOR_KEEPER')).toBe(true)
    expect(shown('OWNER')).toBe(false)
    expect(shown('PLAYER')).toBe(false)
  })

  it('adds the owner when the Keeper shares it with them', () => {
    expect(
      canReadNote({ ...base, kind: 'KEEPER', visibility: 'KEEPERS_AND_OWNER', role: 'OWNER' }),
    ).toBe(true)
    expect(
      canReadNote({ ...base, kind: 'KEEPER', visibility: 'KEEPERS_AND_OWNER', role: 'PLAYER' }),
    ).toBe(false)
  })

  it('shows a campaign note to the party but not to a former member', () => {
    expect(canReadNote({ ...base, kind: 'KEEPER', visibility: 'CAMPAIGN', role: 'PLAYER' })).toBe(
      true,
    )
    expect(
      canReadNote({ ...base, kind: 'KEEPER', visibility: 'CAMPAIGN', role: 'HISTORICAL' }),
    ).toBe(false)
  })
})

describe('isReduction', () => {
  it('knows which way is narrower', () => {
    expect(isReduction('CAMPAIGN', 'KEEPERS')).toBe(true)
    expect(isReduction('KEEPERS_AND_OWNER', 'KEEPERS')).toBe(true)
    expect(isReduction('KEEPERS', 'CAMPAIGN')).toBe(false)
    expect(isReduction('KEEPERS', 'KEEPERS')).toBe(false)
  })
})

describe('audienceLosingAccess', () => {
  const people = {
    keeperIds: ['keeper'],
    ownerId: 'owner',
    campaignMemberIds: ['keeper', 'owner', 'player'],
    authorId: 'keeper',
  }

  it('names the party when a campaign note becomes Keepers-only', () => {
    expect(audienceLosingAccess({ ...people, from: 'CAMPAIGN', to: 'KEEPERS' }).sort()).toEqual([
      'owner',
      'player',
    ])
  })

  it('names only the owner when it stops being shared with them', () => {
    expect(audienceLosingAccess({ ...people, from: 'KEEPERS_AND_OWNER', to: 'KEEPERS' })).toEqual([
      'owner',
    ])
  })

  /*
   * Capturing for somebody who can still read it would write a copy of
   * something nothing has taken away.
   */
  it('names nobody when the note is being widened', () => {
    expect(audienceLosingAccess({ ...people, from: 'KEEPERS', to: 'CAMPAIGN' })).toEqual([])
  })

  it('never names the author, who keeps it regardless', () => {
    expect(audienceLosingAccess({ ...people, from: 'CAMPAIGN', to: 'AUTHOR_ONLY' })).not.toContain(
      'keeper',
    )
  })
})

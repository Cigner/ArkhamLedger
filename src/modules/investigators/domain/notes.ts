import { type Result, fail, ok } from '@/lib/result'
import type { InvestigatorRole } from './access'

/**
 * Notes written about a character.
 *
 * Three kinds, and they behave differently because they are different things.
 * A Keeper's note is campaign business and can be shared. An owner's note is
 * their own. A player's observation of somebody else's character can never be
 * shared at all - that is the whole point of it, and the reason it survives them
 * leaving the campaign.
 *
 * Visibility only ever narrows in effect, never retroactively. Reducing it
 * writes a new revision; whoever could read the old one keeps it. Section 16 of
 * the plan, and the same promise as the rest of the feature: what you were shown
 * stays shown.
 */
export type NoteKind = 'OWNER_PRIVATE' | 'KEEPER' | 'PLAYER_OBSERVATION'

export type NoteVisibility = 'AUTHOR_ONLY' | 'KEEPERS' | 'KEEPERS_AND_OWNER' | 'CAMPAIGN'

/** Which visibilities each kind of note may take. */
const ALLOWED_VISIBILITY: Readonly<Record<NoteKind, readonly NoteVisibility[]>> = {
  OWNER_PRIVATE: ['AUTHOR_ONLY'],
  KEEPER: ['KEEPERS', 'KEEPERS_AND_OWNER', 'CAMPAIGN'],
  PLAYER_OBSERVATION: ['AUTHOR_ONLY'],
}

/**
 * How wide each setting reaches, for deciding whether a change is a reduction.
 *
 * A reduction is what triggers a disclosure capture, so this ordering is not
 * cosmetic: getting it wrong would either capture constantly or silently take
 * something back.
 */
const REACH: Readonly<Record<NoteVisibility, number>> = {
  AUTHOR_ONLY: 0,
  KEEPERS: 1,
  KEEPERS_AND_OWNER: 2,
  CAMPAIGN: 3,
}

export function isReduction(from: NoteVisibility, to: NoteVisibility): boolean {
  return REACH[to] < REACH[from]
}

export function canWriteNote(role: InvestigatorRole | null, kind: NoteKind): Result<void> {
  if (role === null) return fail('investigators.errors.notAllowed')

  switch (kind) {
    case 'OWNER_PRIVATE':
      return role === 'OWNER' ? ok() : fail('investigators.errors.notAllowed')
    case 'KEEPER':
      return role === 'KEEPER' || role === 'CREATOR_KEEPER'
        ? ok()
        : fail('investigators.errors.notAllowed')
    case 'PLAYER_OBSERVATION':
      /*
       * Anybody who can see the character may keep their own notes about it,
       * including its owner - a player's private read of their own character is
       * still theirs alone.
       */
      return ok()
  }
}

export function validateVisibility(kind: NoteKind, visibility: NoteVisibility): Result<void> {
  return ALLOWED_VISIBILITY[kind].includes(visibility)
    ? ok()
    : fail('investigators.errors.invalidNoteVisibility')
}

/**
 * Who can read a note as it stands now.
 *
 * Authorship wins over everything: a note is always readable by the person who
 * wrote it. After that it is the visibility that decides, and an observation
 * never reaches anybody else whatever is asked of it.
 */
export function canReadNote(input: {
  readonly kind: NoteKind
  readonly visibility: NoteVisibility
  readonly viewerId: string
  readonly authorId: string
  readonly role: InvestigatorRole | null
}): boolean {
  if (input.viewerId === input.authorId) return true
  if (input.kind === 'PLAYER_OBSERVATION' || input.kind === 'OWNER_PRIVATE') return false

  switch (input.visibility) {
    case 'AUTHOR_ONLY':
      return false
    case 'KEEPERS':
      return input.role === 'KEEPER' || input.role === 'CREATOR_KEEPER'
    case 'KEEPERS_AND_OWNER':
      return input.role === 'KEEPER' || input.role === 'CREATOR_KEEPER' || input.role === 'OWNER'
    case 'CAMPAIGN':
      return input.role !== null && input.role !== 'HISTORICAL'
  }
}

/**
 * Everybody a revision should be captured for before its visibility narrows.
 *
 * Deliberately the audience of the *old* setting minus the audience of the new
 * one: capturing for people who can still read it would write a copy of
 * something nothing has taken away.
 */
export function audienceLosingAccess(input: {
  readonly from: NoteVisibility
  readonly to: NoteVisibility
  readonly keeperIds: readonly string[]
  readonly ownerId: string
  readonly campaignMemberIds: readonly string[]
  readonly authorId: string
}): string[] {
  const audienceOf = (visibility: NoteVisibility): string[] => {
    switch (visibility) {
      case 'AUTHOR_ONLY':
        return []
      case 'KEEPERS':
        return [...input.keeperIds]
      case 'KEEPERS_AND_OWNER':
        return [...input.keeperIds, input.ownerId]
      case 'CAMPAIGN':
        return [...input.campaignMemberIds]
    }
  }

  const keeps = new Set(audienceOf(input.to))
  return [...new Set(audienceOf(input.from))].filter(
    (userId) => !keeps.has(userId) && userId !== input.authorId,
  )
}

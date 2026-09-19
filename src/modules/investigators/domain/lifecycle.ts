import { type Result, fail, ok } from '@/lib/result'

/**
 * What a character is, and what may still happen to it.
 *
 * Archiving is not in this enum. A character is put away without ceasing to be
 * whatever it was - retired, dead, or merely finished with - so it is a
 * timestamp beside the status rather than a state that overwrites it. Restoring
 * one is clearing a column, not reconstructing a past it no longer records.
 */
export type InvestigatorStatus = 'DRAFT' | 'ACTIVE' | 'RETIRED' | 'DECEASED'

const TRANSITIONS = {
  DRAFT: ['ACTIVE'],
  ACTIVE: ['RETIRED', 'DECEASED'],
  RETIRED: ['ACTIVE'],
  DECEASED: [],
} as const satisfies Readonly<Record<InvestigatorStatus, readonly InvestigatorStatus[]>>

export function transitionInvestigator(
  from: InvestigatorStatus,
  to: InvestigatorStatus,
): Result<InvestigatorStatus> {
  const allowed: readonly InvestigatorStatus[] = TRANSITIONS[from]
  return allowed.includes(to)
    ? ok(to)
    : fail('investigators.errors.invalidStatusTransition', { from, to })
}

type DeletionEligibility = {
  readonly status: InvestigatorStatus
  readonly hasBeenShared: boolean
  readonly hasBeenUsed: boolean
}

export function canPermanentlyDeleteInvestigator(input: DeletionEligibility): boolean {
  return input.status === 'DRAFT' && !input.hasBeenShared && !input.hasBeenUsed
}

/**
 * Whether a character may be put away.
 *
 * Anything may be archived, including a draft somebody thought better of. What
 * archiving is not is deletion: the character stays, its history stays, and the
 * Vault simply stops offering it.
 */
export function canArchive(input: { readonly archivedAt: Date | null }): Result<void> {
  return input.archivedAt === null ? ok() : fail('investigators.errors.alreadyArchived')
}

/**
 * Whether a character may be brought back out.
 *
 * The dead stay dead. Section 5 is explicit that an archived Investigator
 * returns to ACTIVE or RETIRED "unless the Investigator is deceased", and a
 * character who walks back out of the archive alive is a different kind of
 * story from the one this application is keeping records for.
 */
export function canRestore(input: {
  readonly archivedAt: Date | null
  readonly status: InvestigatorStatus
}): Result<void> {
  if (input.archivedAt === null) return fail('investigators.errors.notArchived')
  if (input.status === 'DECEASED') return fail('investigators.errors.deceasedStaysArchived')
  return ok()
}

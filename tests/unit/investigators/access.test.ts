import { describe, expect, it } from 'vitest'
import {
  type InvestigatorOperation,
  type InvestigatorRole,
  type InvestigatorViewer,
  editGrantRemainsOpen,
  permits,
  requirePermission,
  resolveRole,
} from '@/modules/investigators/domain/access'

/**
 * Investigator authorization.
 *
 * The permission table is checked against the written rule cell by cell rather
 * than by example, so a widened permission has to be stated here before it takes
 * effect anywhere.
 */
const ALL_ROLES: readonly InvestigatorRole[] = [
  'OWNER',
  'CREATOR_KEEPER',
  'KEEPER',
  'PLAYER',
  'HISTORICAL',
]

function viewer(overrides: Partial<InvestigatorViewer> = {}): InvestigatorViewer {
  return {
    viewerId: 'viewer',
    ownerId: 'owner',
    hasOpenEditGrant: false,
    keepsLinkedCampaign: false,
    playsLinkedCampaign: false,
    hasHistoricalAccess: false,
    ...overrides,
  }
}

describe('resolveRole', () => {
  it('is the owner when the viewer owns the sheet', () => {
    expect(resolveRole(viewer({ viewerId: 'owner' }))).toBe('OWNER')
  })

  it('is nobody without any relationship at all', () => {
    expect(resolveRole(viewer())).toBeNull()
  })

  /*
   * Overlap is the normal case, not an edge: the Keeper of one campaign plays in
   * another, and a former player of an ended campaign is still in the group.
   * Resolving to the strongest keeps a person from being refused something a
   * different reading of them allowed.
   */
  it('takes the strongest role when several apply', () => {
    expect(
      resolveRole(
        viewer({
          viewerId: 'owner',
          playsLinkedCampaign: true,
          hasHistoricalAccess: true,
        }),
      ),
    ).toBe('OWNER')

    expect(resolveRole(viewer({ hasOpenEditGrant: true, keepsLinkedCampaign: true }))).toBe(
      'CREATOR_KEEPER',
    )

    expect(resolveRole(viewer({ playsLinkedCampaign: true, hasHistoricalAccess: true }))).toBe(
      'PLAYER',
    )
  })

  it('falls back to historical access once the live relationship ends', () => {
    expect(resolveRole(viewer({ hasHistoricalAccess: true }))).toBe('HISTORICAL')
  })
})

describe('permission table', () => {
  const EXPECTED: Readonly<Record<InvestigatorOperation, readonly InvestigatorRole[]>> = {
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

  const CELLS = Object.keys(EXPECTED).flatMap((operation) =>
    ALL_ROLES.map((role) => [operation as InvestigatorOperation, role] as const),
  )

  it.each(CELLS)('%s is allowed for %s exactly as written', (operation, role) => {
    expect(permits(role, operation)).toBe(EXPECTED[operation].includes(role))
  })

  it('refuses everything to a viewer with no role', () => {
    for (const operation of Object.keys(EXPECTED) as InvestigatorOperation[]) {
      expect(permits(null, operation)).toBe(false)
    }
  })

  /*
   * A Keeper runs the game the sheet appears in; they do not own the character.
   * This is the cell most likely to be widened by accident, because a Keeper can
   * do everything else.
   */
  it('never lets an ordinary Keeper edit a sheet', () => {
    expect(permits('KEEPER', 'EDIT_SHEET')).toBe(false)
    expect(permits('KEEPER', 'CONFIGURE_PRIVACY')).toBe(false)
  })

  it('tells a refused caller nothing about which right they lack', () => {
    const first = requirePermission('PLAYER', 'EDIT_SHEET')
    const second = requirePermission('PLAYER', 'APPROVE_TRANSFER')

    expect(first.ok).toBe(false)
    expect(second.ok).toBe(false)
    if (first.ok || second.ok) return
    expect(first.error.key).toBe(second.error.key)
  })
})

describe('editGrantRemainsOpen', () => {
  const grant = {
    closedAt: null,
    keeperStillKeepsCampaign: true,
    investigatorFirstUsedAt: null,
  }

  it('is open for a grant nobody has spent yet', () => {
    expect(editGrantRemainsOpen(grant)).toBe(true)
  })

  it('closes at the first use of the Investigator', () => {
    expect(
      editGrantRemainsOpen({ ...grant, investigatorFirstUsedAt: new Date('2026-09-18T20:00:00Z') }),
    ).toBe(false)
  })

  it('closes when the Keeper stops keeping the campaign it came from', () => {
    expect(editGrantRemainsOpen({ ...grant, keeperStillKeepsCampaign: false })).toBe(false)
  })

  it('stays closed once closed', () => {
    expect(editGrantRemainsOpen({ ...grant, closedAt: new Date('2026-09-18T20:00:00Z') })).toBe(
      false,
    )
  })
})

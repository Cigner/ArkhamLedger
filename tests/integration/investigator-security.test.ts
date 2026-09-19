import { beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import {
  campaignInvestigator,
  campaignMember,
  investigator,
  investigatorCharacteristic,
  investigatorEditGrant,
  investigatorFieldVisibility,
  investigatorLineage,
  investigatorProfile,
  investigatorSkill,
  investigatorSnapshot,
  investigatorState,
} from '@/db/schema'
import { newId } from '@/lib/ids'
import { ForbiddenError, NotFoundError } from '@/lib/errors'
import { addMemberRow, createCampaignRow, createUserRow, truncateAll } from './helpers/fixtures'

/**
 * The security properties section 23 of the plan says must be proven.
 *
 * Every one of these is written as an attempt rather than as an assertion about
 * intent: the question is not whether the code means to withhold something, but
 * whether a payload that reaches a reader contains it. A test that checks a flag
 * proves nothing about what was serialized.
 */
const NOW = new Date('2026-09-14T12:00:00.000Z')

const viewer = { id: '' }

vi.mock('@/lib/auth', () => ({
  requireUser: () => Promise.resolve({ id: viewer.id, role: 'USER', status: 'ACTIVE' }),
}))

const { getInvestigatorView } = await import('@/modules/investigators/data/investigator-view')
const { requireInvestigatorAccess } = await import('@/modules/investigators/data/guards')
const { listAllActiveBindings, listOwnInvestigators } =
  await import('@/modules/investigators/data/campaign-bindings')
const { captureSnapshot, findLatestDisclosure, unlinkFromCampaign } =
  await import('@/modules/investigators/data/snapshots')
const { createNote, listNotes } = await import('@/modules/investigators/data/notes')
const { canReadNote } = await import('@/modules/investigators/domain/notes')

async function seedCharacter(input: { ownerId: string; hidden?: readonly string[] }) {
  const lineageId = newId()
  const investigatorId = newId()

  await db
    .insert(investigatorLineage)
    .values({ id: lineageId, createdBy: input.ownerId, createdAt: NOW })
  await db.insert(investigator).values({
    id: investigatorId,
    lineageId,
    ownerId: input.ownerId,
    creatorId: input.ownerId,
    status: 'ACTIVE',
    creationMethod: 'STANDARD_ROLLS',
    rulesetId: 'coc7-classic-1920s',
    rulesetVersion: '1.0.0',
    era: 'CLASSIC_1920S',
    createdAt: NOW,
    updatedAt: NOW,
  })
  await db.insert(investigatorProfile).values({
    investigatorId,
    name: 'Harriet Vane',
    age: 34,
    residence: 'Oxford',
    createdAt: NOW,
    updatedAt: NOW,
  })
  await db.insert(investigatorCharacteristic).values({
    investigatorId,
    strength: 50,
    constitution: 60,
    size: 55,
    dexterity: 65,
    appearance: 70,
    intelligence: 80,
    power: 75,
    education: 85,
    createdAt: NOW,
    updatedAt: NOW,
  })
  await db.insert(investigatorState).values({
    investigatorId,
    hitPoints: 11,
    sanity: 75,
    createdAt: NOW,
    updatedAt: NOW,
  })
  await db.insert(investigatorSkill).values({
    id: newId(),
    investigatorId,
    definitionId: 'library-use',
    specializationKey: '',
    baseValue: 20,
    currentValue: 60,
    createdAt: NOW,
    updatedAt: NOW,
  })

  for (const fieldKey of input.hidden ?? []) {
    await db.insert(investigatorFieldVisibility).values({
      id: newId(),
      investigatorId,
      fieldKey,
      visibility: 'HIDDEN',
      createdAt: NOW,
      updatedAt: NOW,
    })
  }

  return investigatorId
}

async function seedParty() {
  const owner = await createUserRow({ status: 'ACTIVE', name: 'Owner' })
  const keeper = await createUserRow({ status: 'ACTIVE', name: 'Keeper' })
  const player = await createUserRow({ status: 'ACTIVE', name: 'Player' })
  const outsider = await createUserRow({ status: 'ACTIVE', name: 'Outsider' })
  const campaign = await createCampaignRow({ ownerId: keeper.id })
  await addMemberRow({ campaignId: campaign.id, userId: owner.id })
  await addMemberRow({ campaignId: campaign.id, userId: player.id })

  return { owner, keeper, player, outsider, campaignId: campaign.id }
}

async function link(investigatorId: string, campaignId: string) {
  const id = newId()
  await db.insert(campaignInvestigator).values({
    id,
    campaignId,
    investigatorId,
    linkedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
  })
  return id
}

beforeEach(async () => {
  await truncateAll()
})

describe('hidden values are absent from the response', () => {
  it('does not serialize a hidden field, not even as something to ignore', async () => {
    const party = await seedParty()
    const investigatorId = await seedCharacter({
      ownerId: party.owner.id,
      hidden: ['identity.residence'],
    })
    await link(investigatorId, party.campaignId)
    viewer.id = party.player.id

    const view = await getInvestigatorView(investigatorId)

    expect(view.sheet.identity.residence).toBeNull()
    expect(JSON.stringify(view)).not.toContain('Oxford')
    expect(view.sheet.redacted).toContain('identity.residence')
  })

  it('shows the same field to the owner and to the Keeper', async () => {
    const party = await seedParty()
    const investigatorId = await seedCharacter({
      ownerId: party.owner.id,
      hidden: ['identity.residence'],
    })
    await link(investigatorId, party.campaignId)

    for (const reader of [party.owner.id, party.keeper.id]) {
      viewer.id = reader
      const view = await getInvestigatorView(investigatorId)
      expect(view.sheet.identity.residence).toBe('Oxford')
    }
  })
})

describe('a calculated value does not leak its source', () => {
  it('withholds Build and the damage bonus when SIZ is hidden', async () => {
    const party = await seedParty()
    const investigatorId = await seedCharacter({
      ownerId: party.owner.id,
      hidden: ['characteristics.SIZ'],
    })
    await link(investigatorId, party.campaignId)
    viewer.id = party.player.id

    const view = await getInvestigatorView(investigatorId)

    expect(view.sheet.characteristics.SIZ).toBeNull()
    expect(view.sheet.build).toBeNull()
    expect(view.sheet.damageBonus).toBeNull()
    expect(view.sheet.hitPoints).toEqual({ current: null, maximum: null })
    // STR was never hidden and is still there, so this is not a blanket wipe.
    expect(view.sheet.characteristics.STR).toBe(50)
  })
})

describe('full snapshots are not reachable through disclosure access', () => {
  it('hands a former reader their projection, never the archive', async () => {
    const party = await seedParty()
    const investigatorId = await seedCharacter({
      ownerId: party.owner.id,
      hidden: ['identity.residence'],
    })
    await link(investigatorId, party.campaignId)

    await db.transaction((tx) =>
      captureSnapshot({
        investigatorId,
        kind: 'MANUAL',
        campaignId: party.campaignId,
        now: NOW,
        executor: tx,
      }),
    )

    await db.transaction((tx) =>
      unlinkFromCampaign({
        investigatorId,
        campaignId: party.campaignId,
        reason: null,
        now: NOW,
        executor: tx,
      }),
    )

    const kept = await findLatestDisclosure({ investigatorId, viewerId: party.player.id })
    expect(kept).not.toBeNull()

    const serialized = JSON.stringify(kept)
    expect(serialized).not.toContain('Oxford')

    // The archive itself still holds the unredacted sheet, for the owner's history.
    const [snapshot] = await db
      .select()
      .from(investigatorSnapshot)
      .where(eq(investigatorSnapshot.investigatorId, investigatorId))
    expect(JSON.stringify(snapshot?.state)).toContain('Oxford')
  })
})

describe('identifiers do not bypass authorization', () => {
  it('tells a stranger holding a character id that it does not exist', async () => {
    const party = await seedParty()
    const investigatorId = await seedCharacter({ ownerId: party.owner.id })
    await link(investigatorId, party.campaignId)
    viewer.id = party.outsider.id

    await expect(getInvestigatorView(investigatorId)).rejects.toBeInstanceOf(NotFoundError)
  })

  it('refuses a campaign member the character was never linked to', async () => {
    const party = await seedParty()
    const investigatorId = await seedCharacter({ ownerId: party.owner.id })
    // Deliberately not linked to the campaign.
    viewer.id = party.player.id

    await expect(getInvestigatorView(investigatorId)).rejects.toBeInstanceOf(NotFoundError)
  })

  it('never lists somebody else\\u2019s Vault, whoever is asking', async () => {
    const party = await seedParty()
    const mine = await seedCharacter({ ownerId: party.owner.id })
    await seedCharacter({ ownerId: party.keeper.id })

    viewer.id = party.owner.id
    const listed = await listOwnInvestigators()

    expect(listed.map((entry) => entry.investigatorId)).toEqual([mine])
  })

  it('refuses a player who tries to edit a character they can only read', async () => {
    const party = await seedParty()
    const investigatorId = await seedCharacter({ ownerId: party.owner.id })
    await link(investigatorId, party.campaignId)
    viewer.id = party.player.id

    await expect(requireInvestigatorAccess(investigatorId, 'EDIT_SHEET')).rejects.toBeInstanceOf(
      ForbiddenError,
    )
  })
})

describe('a former Keeper keeps nothing active', () => {
  it('loses the sheet when they leave the campaign', async () => {
    const party = await seedParty()
    const investigatorId = await seedCharacter({ ownerId: party.owner.id })
    await link(investigatorId, party.campaignId)
    viewer.id = party.keeper.id

    expect((await requireInvestigatorAccess(investigatorId, 'VIEW_FULL')).role).toBe('KEEPER')

    await db
      .update(campaignMember)
      .set({ status: 'LEFT', leftAt: NOW })
      .where(eq(campaignMember.userId, party.keeper.id))

    await expect(getInvestigatorView(investigatorId)).rejects.toBeInstanceOf(NotFoundError)
  })

  /*
   * The creating Keeper's grant is the one permission that outlives leaving in
   * the database, because the row is still there. It must not outlive it in
   * effect.
   */
  it('cannot use a creator grant after leaving', async () => {
    const party = await seedParty()
    const investigatorId = await seedCharacter({ ownerId: party.owner.id })
    await db.insert(investigatorEditGrant).values({
      id: newId(),
      investigatorId,
      campaignId: party.campaignId,
      keeperId: party.keeper.id,
      grantedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    })
    viewer.id = party.keeper.id

    expect((await requireInvestigatorAccess(investigatorId, 'EDIT_SHEET')).role).toBe(
      'CREATOR_KEEPER',
    )

    await db
      .update(campaignMember)
      .set({ status: 'LEFT', leftAt: NOW })
      .where(eq(campaignMember.userId, party.keeper.id))

    await expect(requireInvestigatorAccess(investigatorId, 'EDIT_SHEET')).rejects.toBeInstanceOf(
      NotFoundError,
    )
  })
})

describe('private notes stay author-only', () => {
  it('keeps an observation out of everybody else\\u2019s view, including the Keeper\\u2019s', async () => {
    const party = await seedParty()
    const investigatorId = await seedCharacter({ ownerId: party.owner.id })
    await link(investigatorId, party.campaignId)

    await db.transaction((tx) =>
      createNote({
        investigatorId,
        campaignId: party.campaignId,
        authorId: party.player.id,
        kind: 'PLAYER_OBSERVATION',
        content: 'I do not believe a word she says.',
        visibility: 'AUTHOR_ONLY',
        now: NOW,
        executor: tx,
      }),
    )

    for (const reader of [party.owner.id, party.keeper.id]) {
      viewer.id = reader
      const view = await getInvestigatorView(investigatorId)
      expect(JSON.stringify(view.notes)).not.toContain('I do not believe')
    }

    viewer.id = party.player.id
    const authorView = await getInvestigatorView(investigatorId)
    expect(JSON.stringify(authorView.notes)).toContain('I do not believe')
  })

  it('survives the author leaving the campaign', async () => {
    const party = await seedParty()
    const investigatorId = await seedCharacter({ ownerId: party.owner.id })
    await link(investigatorId, party.campaignId)

    await db.transaction((tx) =>
      createNote({
        investigatorId,
        campaignId: party.campaignId,
        authorId: party.player.id,
        kind: 'PLAYER_OBSERVATION',
        content: 'Still do not believe her.',
        visibility: 'AUTHOR_ONLY',
        now: NOW,
        executor: tx,
      }),
    )

    await db
      .update(campaignMember)
      .set({ status: 'LEFT', leftAt: NOW })
      .where(eq(campaignMember.userId, party.player.id))

    const stored = await listNotes(investigatorId)
    const theirs = stored.find((note) => note.authorId === party.player.id)

    expect(theirs).toBeDefined()
    expect(
      canReadNote({
        kind: theirs!.kind,
        visibility: theirs!.visibility,
        viewerId: party.player.id,
        authorId: theirs!.authorId,
        role: null,
      }),
    ).toBe(true)
  })
})

describe('the export carries no more than the screen', () => {
  /*
   * The most convenient hole in the whole feature would be a download that
   * skipped the projection, so the export is checked against the same reader
   * whose sheet is redacted.
   */
  it('withholds from a file exactly what it withholds from a page', async () => {
    const party = await seedParty()
    const investigatorId = await seedCharacter({
      ownerId: party.owner.id,
      hidden: ['identity.residence'],
    })
    await link(investigatorId, party.campaignId)
    viewer.id = party.player.id

    const view = await getInvestigatorView(investigatorId)
    const exported = {
      format: 'arkham-ledger/investigator',
      sheet: view.sheet,
    }

    expect(JSON.stringify(exported)).not.toContain('Oxford')
    expect(JSON.stringify(exported)).toContain('Harriet Vane')
  })
})

describe('a duplicate inherits the sheet, not the audience', () => {
  it('copies privacy but no campaign, history or disclosure', async () => {
    const { branchInvestigator } = await import('@/modules/investigators/data/branching')
    const party = await seedParty()
    const investigatorId = await seedCharacter({
      ownerId: party.owner.id,
      hidden: ['identity.residence'],
    })
    await link(investigatorId, party.campaignId)

    await db.transaction((tx) =>
      captureSnapshot({
        investigatorId,
        kind: 'MANUAL',
        campaignId: party.campaignId,
        now: NOW,
        executor: tx,
      }),
    )

    const copyId = await db.transaction((tx) =>
      branchInvestigator({
        sourceInvestigatorId: investigatorId,
        newOwnerId: party.owner.id,
        createdBy: party.owner.id,
        now: NOW,
        executor: tx,
      }),
    )

    const bindings = await db
      .select()
      .from(campaignInvestigator)
      .where(eq(campaignInvestigator.investigatorId, copyId))
    expect(bindings).toEqual([])

    const snapshots = await db
      .select()
      .from(investigatorSnapshot)
      .where(eq(investigatorSnapshot.investigatorId, copyId))
    expect(snapshots).toEqual([])

    const privacy = await db
      .select()
      .from(investigatorFieldVisibility)
      .where(eq(investigatorFieldVisibility.investigatorId, copyId))
    expect(privacy.map((row) => row.fieldKey)).toEqual(['identity.residence'])

    // The player could read the original through the campaign; the copy is not in one.
    viewer.id = party.player.id
    await expect(getInvestigatorView(copyId)).rejects.toBeInstanceOf(NotFoundError)
  })
})

/**
 * Section 17: an administrator has no ordinary access to a character. The
 * recovery screen lists who holds what so a stalled campaign can be unstuck,
 * and a name its owner hid is not part of that.
 */
describe('the administrator’s recovery list', () => {
  it('withholds a name the owner has hidden', async () => {
    const party = await seedParty()
    const investigatorId = await seedCharacter({ ownerId: party.owner.id })
    await link(investigatorId, party.campaignId)

    const before = await listAllActiveBindings()
    expect(before[0]?.investigatorName).toBe('Harriet Vane')

    await db.insert(investigatorFieldVisibility).values({
      id: newId(),
      investigatorId,
      fieldKey: 'identity.name',
      visibility: 'HIDDEN',
      createdAt: NOW,
      updatedAt: NOW,
    })

    const after = await listAllActiveBindings()
    expect(after[0]?.investigatorName).toBeNull()
    expect(after[0]?.ownerName).toBe('Owner')
  })
})

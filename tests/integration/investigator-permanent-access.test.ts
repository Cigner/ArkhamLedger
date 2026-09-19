import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import {
  campaignInvestigator,
  investigator,
  investigatorFieldVisibility,
  investigatorLineage,
  investigatorProfile,
  investigatorState,
} from '@/db/schema'
import { newId } from '@/lib/ids'
import {
  captureOnFieldsHidden,
  listDisclosuresFor,
  listKeptDisclosures,
  readKeptDisclosure,
  unlinkFromCampaign,
} from '@/modules/investigators/data/snapshots'
import { addMemberRow, createCampaignRow, createUserRow, truncateAll } from './helpers/fixtures'

/**
 * The visible half of permanent access.
 *
 * Section 15 was true in the database and invisible everywhere else, which is a
 * promise to nobody. These tests are about the list somebody actually reads.
 */
const NOW = new Date('2026-09-14T12:00:00.000Z')

async function seed() {
  const owner = await createUserRow({ status: 'ACTIVE', name: 'Owner' })
  const keeper = await createUserRow({ status: 'ACTIVE', name: 'Keeper' })
  const campaign = await createCampaignRow({ ownerId: keeper.id })
  await addMemberRow({ campaignId: campaign.id, userId: owner.id })

  const lineageId = newId()
  const investigatorId = newId()
  await db
    .insert(investigatorLineage)
    .values({ id: lineageId, createdBy: owner.id, createdAt: NOW })
  await db.insert(investigator).values({
    id: investigatorId,
    lineageId,
    ownerId: owner.id,
    creatorId: owner.id,
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
    residence: 'Oxford',
    createdAt: NOW,
    updatedAt: NOW,
  })
  await db.insert(investigatorState).values({ investigatorId, createdAt: NOW, updatedAt: NOW })

  await db.insert(campaignInvestigator).values({
    id: newId(),
    campaignId: campaign.id,
    investigatorId,
    linkedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
  })

  return { owner, keeper, campaignId: campaign.id, investigatorId }
}

beforeEach(async () => {
  await truncateAll()
})

describe('what a person keeps', () => {
  it('appears once the character leaves the campaign', async () => {
    const seeded = await seed()

    expect(await listKeptDisclosures({ viewerId: seeded.keeper.id })).toEqual([])

    await db.transaction((tx) =>
      unlinkFromCampaign({
        investigatorId: seeded.investigatorId,
        campaignId: seeded.campaignId,
        reason: null,
        now: NOW,
        executor: tx,
      }),
    )

    const kept = await listKeptDisclosures({ viewerId: seeded.keeper.id })

    expect(kept).toHaveLength(1)
    expect(kept[0]?.name).toBe('Harriet Vane')
    expect(kept[0]?.reason).toBe('CAMPAIGN_UNLINKED')
    expect(kept[0]?.stillReachable).toBe(false)
  })

  it('is readable afterwards, frozen as it was', async () => {
    const seeded = await seed()

    await db.transaction((tx) =>
      unlinkFromCampaign({
        investigatorId: seeded.investigatorId,
        campaignId: seeded.campaignId,
        reason: null,
        now: NOW,
        executor: tx,
      }),
    )

    // The character changes afterwards; what was kept does not.
    await db
      .update(investigatorProfile)
      .set({ name: 'Somebody Else', residence: 'Innsmouth' })
      .where(eq(investigatorProfile.investigatorId, seeded.investigatorId))

    const kept = await readKeptDisclosure({
      investigatorId: seeded.investigatorId,
      viewerId: seeded.keeper.id,
    })

    expect(kept?.sheet.identity.name).toBe('Harriet Vane')
    expect(kept?.sheet.identity.residence).toBe('Oxford')
  })

  /*
   * The owner loses nothing when a character leaves a campaign, so they have no
   * disclosure to keep - the sheet is still theirs.
   */
  it('is nothing for the person who still owns the character', async () => {
    const seeded = await seed()

    await db.transaction((tx) =>
      unlinkFromCampaign({
        investigatorId: seeded.investigatorId,
        campaignId: seeded.campaignId,
        reason: null,
        now: NOW,
        executor: tx,
      }),
    )

    expect(await listKeptDisclosures({ viewerId: seeded.owner.id })).toEqual([])
  })

  it('gives nothing to somebody who was never shown it', async () => {
    const seeded = await seed()
    const stranger = await createUserRow({ status: 'ACTIVE' })

    await db.transaction((tx) =>
      unlinkFromCampaign({
        investigatorId: seeded.investigatorId,
        campaignId: seeded.campaignId,
        reason: null,
        now: NOW,
        executor: tx,
      }),
    )

    expect(await listKeptDisclosures({ viewerId: stranger.id })).toEqual([])
    expect(
      await readKeptDisclosure({
        investigatorId: seeded.investigatorId,
        viewerId: stranger.id,
      }),
    ).toBeNull()
  })

  it('marks a character the reader can still reach live', async () => {
    const seeded = await seed()
    const other = await createCampaignRow({ ownerId: seeded.keeper.id })

    await db.transaction((tx) =>
      unlinkFromCampaign({
        investigatorId: seeded.investigatorId,
        campaignId: seeded.campaignId,
        reason: null,
        now: NOW,
        executor: tx,
      }),
    )

    // The same character joins another campaign the Keeper is in.
    await db.insert(campaignInvestigator).values({
      id: newId(),
      campaignId: other.id,
      investigatorId: seeded.investigatorId,
      linkedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    })
    // createCampaignRow already enrols its owner as a Keeper.

    const kept = await listKeptDisclosures({ viewerId: seeded.keeper.id })
    expect(kept[0]?.stillReachable).toBe(true)
  })
})

/**
 * The first of the six moments in section 15, and the only one where nobody's
 * access ends: the party keeps the sheet and loses a part of it.
 */
describe('hiding a field', () => {
  async function seedWithPlayer() {
    const seeded = await seed()
    const player = await createUserRow({ status: 'ACTIVE', name: 'Player' })
    await addMemberRow({ campaignId: seeded.campaignId, userId: player.id })
    return { ...seeded, player }
  }

  it('leaves the players who could read it what they had', async () => {
    const seeded = await seedWithPlayer()

    const captured = await db.transaction((tx) =>
      captureOnFieldsHidden({ investigatorId: seeded.investigatorId, now: NOW, executor: tx }),
    )

    expect(captured).toBe(1)

    const kept = await readKeptDisclosure({
      investigatorId: seeded.investigatorId,
      viewerId: seeded.player.id,
    })

    expect(kept?.reason).toBe('FIELD_HIDDEN')
    expect(kept?.sheet.identity.residence).toBe('Oxford')
  })

  /*
   * Section 14 gives a Keeper the campaign-context sheet in full, so hiding a
   * field takes nothing from them and there is nothing to preserve.
   */
  it('captures nothing for a Keeper, who was never going to lose it', async () => {
    const seeded = await seedWithPlayer()

    await db.transaction((tx) =>
      captureOnFieldsHidden({ investigatorId: seeded.investigatorId, now: NOW, executor: tx }),
    )

    expect(await listKeptDisclosures({ viewerId: seeded.keeper.id })).toEqual([])
  })

  it('captures nothing for the owner, who is doing the hiding', async () => {
    const seeded = await seedWithPlayer()

    await db.transaction((tx) =>
      captureOnFieldsHidden({ investigatorId: seeded.investigatorId, now: NOW, executor: tx }),
    )

    expect(await listKeptDisclosures({ viewerId: seeded.owner.id })).toEqual([])
  })

  /*
   * Live access is untouched. The entry is a memory of a value, not a sign that
   * somebody has been shut out.
   */
  it('marks the character as one the reader can still open', async () => {
    const seeded = await seedWithPlayer()

    await db.transaction((tx) =>
      captureOnFieldsHidden({ investigatorId: seeded.investigatorId, now: NOW, executor: tx }),
    )

    const kept = await listKeptDisclosures({ viewerId: seeded.player.id })

    expect(kept).toHaveLength(1)
    expect(kept[0]?.stillReachable).toBe(true)
  })
})

/**
 * Permanent access is a list of moments, not a latest state.
 *
 * Hiding a field captures while everybody keeps their access; leaving the
 * campaign later captures a sheet that no longer has the field in it. Reading
 * only the newest of those would quietly take back what the first one
 * preserved.
 */
describe('several captures of the same character', () => {
  it('keeps each one readable by the person it was taken for', async () => {
    const seeded = await seed()
    const player = await createUserRow({ status: 'ACTIVE', name: 'Player' })
    await addMemberRow({ campaignId: seeded.campaignId, userId: player.id })

    await db.transaction((tx) =>
      captureOnFieldsHidden({ investigatorId: seeded.investigatorId, now: NOW, executor: tx }),
    )

    await db.insert(investigatorFieldVisibility).values({
      id: newId(),
      investigatorId: seeded.investigatorId,
      fieldKey: 'identity.residence',
      visibility: 'HIDDEN',
      createdAt: NOW,
      updatedAt: NOW,
    })

    const later = new Date(NOW.getTime() + 60_000)
    await db.transaction((tx) =>
      unlinkFromCampaign({
        investigatorId: seeded.investigatorId,
        campaignId: seeded.campaignId,
        reason: null,
        now: later,
        executor: tx,
      }),
    )

    const moments = await listDisclosuresFor({
      investigatorId: seeded.investigatorId,
      viewerId: player.id,
    })

    expect(moments.map((moment) => moment.reason)).toEqual(['CAMPAIGN_UNLINKED', 'FIELD_HIDDEN'])

    const newest = await readKeptDisclosure({
      investigatorId: seeded.investigatorId,
      viewerId: player.id,
    })
    const earlier = await readKeptDisclosure({
      investigatorId: seeded.investigatorId,
      viewerId: player.id,
      snapshotId: moments[1]!.id,
    })

    expect(newest?.sheet.identity.residence).toBeNull()
    expect(earlier?.sheet.identity.residence).toBe('Oxford')
  })

  it('refuses a capture taken for somebody else', async () => {
    const seeded = await seed()
    const player = await createUserRow({ status: 'ACTIVE', name: 'Player' })
    await addMemberRow({ campaignId: seeded.campaignId, userId: player.id })
    const stranger = await createUserRow({ status: 'ACTIVE' })

    await db.transaction((tx) =>
      captureOnFieldsHidden({ investigatorId: seeded.investigatorId, now: NOW, executor: tx }),
    )

    const moments = await listDisclosuresFor({
      investigatorId: seeded.investigatorId,
      viewerId: player.id,
    })

    expect(
      await readKeptDisclosure({
        investigatorId: seeded.investigatorId,
        viewerId: stranger.id,
        snapshotId: moments[0]!.id,
      }),
    ).toBeNull()
  })
})

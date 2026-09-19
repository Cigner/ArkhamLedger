import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import {
  campaignInvestigator,
  investigator,
  investigatorLineage,
  investigatorNote,
  investigatorProfile,
  investigatorState,
} from '@/db/schema'
import { newId } from '@/lib/ids'
import {
  attachDisclosureToObservations,
  createNote,
  listOwnObservations,
} from '@/modules/investigators/data/notes'
import { unlinkFromCampaign } from '@/modules/investigators/data/snapshots'
import { addMemberRow, createCampaignRow, createUserRow, truncateAll } from './helpers/fixtures'

/**
 * A player's observation and the sheet it was written about.
 *
 * Section 16 says an observation references the latest disclosure available to
 * its author. The point is what happens afterwards: the note survives somebody
 * leaving a campaign, and so does the character it describes.
 */
const NOW = new Date('2026-09-14T12:00:00.000Z')

async function seed() {
  const owner = await createUserRow({ status: 'ACTIVE', name: 'Owner' })
  const player = await createUserRow({ status: 'ACTIVE', name: 'Player' })
  const keeper = await createUserRow({ status: 'ACTIVE', name: 'Keeper' })
  const campaign = await createCampaignRow({ ownerId: keeper.id })
  await addMemberRow({ campaignId: campaign.id, userId: owner.id })
  await addMemberRow({ campaignId: campaign.id, userId: player.id })

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

  const noteId = await createNote({
    investigatorId,
    campaignId: campaign.id,
    authorId: player.id,
    kind: 'PLAYER_OBSERVATION',
    content: 'She never once looked at the painting.',
    visibility: 'AUTHOR_ONLY',
    now: NOW,
    executor: db,
  })

  return { owner, player, keeper, campaignId: campaign.id, investigatorId, noteId }
}

beforeEach(async () => {
  await truncateAll()
})

describe('observations and the sheet they describe', () => {
  it('starts unattached while the author can still see the character', async () => {
    const seeded = await seed()

    const [row] = await db
      .select({ disclosureSnapshotId: investigatorNote.disclosureSnapshotId })
      .from(investigatorNote)
      .where(eq(investigatorNote.id, seeded.noteId))

    expect(row?.disclosureSnapshotId).toBeNull()
  })

  it('is pinned to the disclosure taken when the author loses access', async () => {
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

    const [row] = await db
      .select({ disclosureSnapshotId: investigatorNote.disclosureSnapshotId })
      .from(investigatorNote)
      .where(eq(investigatorNote.id, seeded.noteId))

    expect(row?.disclosureSnapshotId).not.toBeNull()
  })

  /*
   * The pin records a moment. Rewriting it on every later disclosure would
   * point an old note at a sheet its author had not seen when they wrote it.
   */
  it('keeps the first disclosure rather than following later ones', async () => {
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

    const [first] = await db
      .select({ disclosureSnapshotId: investigatorNote.disclosureSnapshotId })
      .from(investigatorNote)
      .where(eq(investigatorNote.id, seeded.noteId))

    const later = await db.transaction((tx) =>
      attachDisclosureToObservations({
        investigatorId: seeded.investigatorId,
        authorId: seeded.player.id,
        disclosureSnapshotId: newId(),
        executor: tx,
      }),
    )

    const [after] = await db
      .select({ disclosureSnapshotId: investigatorNote.disclosureSnapshotId })
      .from(investigatorNote)
      .where(eq(investigatorNote.id, seeded.noteId))

    expect(later).toBe(0)
    expect(after?.disclosureSnapshotId).toBe(first?.disclosureSnapshotId)
  })

  it('remains readable by its author after they leave', async () => {
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

    const own = await listOwnObservations({
      investigatorId: seeded.investigatorId,
      authorId: seeded.player.id,
    })

    expect(own).toHaveLength(1)
    expect(own[0]?.content).toBe('She never once looked at the painting.')
  })

  it('belongs to nobody else, the owner included', async () => {
    const seeded = await seed()

    expect(
      await listOwnObservations({
        investigatorId: seeded.investigatorId,
        authorId: seeded.owner.id,
      }),
    ).toEqual([])
  })
})

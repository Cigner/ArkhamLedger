import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import {
  campaignInvestigator,
  gameSession,
  investigator,
  investigatorLineage,
  investigatorProfile,
  investigatorSnapshot,
  investigatorState,
  investigatorTransfer,
  sessionInvestigatorAssignment,
  sessionParticipant,
} from '@/db/schema'
import { newId } from '@/lib/ids'
import { assignInvestigator } from '@/modules/investigators/data/assignments'
import { findLiveSessionStart } from '@/modules/investigators/data/campaign-bindings'
import {
  captureDisclosure,
  findLatestDisclosure,
  findSessionSnapshots,
} from '@/modules/investigators/data/snapshots'
import { findPendingTransfer } from '@/modules/investigators/data/transfers'
import { addMemberRow, createCampaignRow, createUserRow, truncateAll } from './helpers/fixtures'

/**
 * Bugs found by reading the finished feature, kept so they stay fixed.
 *
 * Each of these passed every existing test and would have shown up as something
 * inexplicable at a table months later.
 */
const NOW = new Date('2026-09-14T22:30:00.000Z')

async function createCharacter(ownerId: string) {
  const lineageId = newId()
  const investigatorId = newId()

  await db.insert(investigatorLineage).values({ id: lineageId, createdBy: ownerId, createdAt: NOW })
  await db.insert(investigator).values({
    id: investigatorId,
    lineageId,
    ownerId,
    creatorId: ownerId,
    status: 'ACTIVE',
    creationMethod: 'STANDARD_ROLLS',
    rulesetId: 'coc7-classic-1920s',
    rulesetVersion: '1.0.0',
    era: 'CLASSIC_1920S',
    createdAt: NOW,
    updatedAt: NOW,
  })
  await db.insert(investigatorProfile).values({ investigatorId, createdAt: NOW, updatedAt: NOW })
  await db.insert(investigatorState).values({ investigatorId, createdAt: NOW, updatedAt: NOW })

  return investigatorId
}

beforeEach(async () => {
  await truncateAll()
})

describe('two disclosures written in one transaction', () => {
  /*
   * Unlinking a character captures for everybody at once, so the timestamps are
   * identical. Ordering on the timestamp alone picked between them arbitrarily,
   * and a viewer could be handed somebody else's projection.
   */
  it('returns this viewer\\u2019s own, deterministically', async () => {
    const owner = await createUserRow({ status: 'ACTIVE' })
    const keeper = await createUserRow({ status: 'ACTIVE' })
    const investigatorId = await createCharacter(owner.id)

    await db.transaction(async (tx) => {
      await captureDisclosure({
        investigatorId,
        viewerId: keeper.id,
        role: 'KEEPER',
        reason: 'CAMPAIGN_ENDED',
        now: NOW,
        executor: tx,
      })
      await captureDisclosure({
        investigatorId,
        viewerId: keeper.id,
        role: 'PLAYER',
        reason: 'CAMPAIGN_UNLINKED',
        now: NOW,
        executor: tx,
      })
    })

    const first = await findLatestDisclosure({ investigatorId, viewerId: keeper.id })
    const again = await findLatestDisclosure({ investigatorId, viewerId: keeper.id })

    expect(first?.id).toBe(again?.id)
  })
})

describe('a snapshot written by another schema version', () => {
  /*
   * The version column existed to guard this and was never read: the payload was
   * cast and its sheet used, so a future shape would surface as a comparison
   * crashing on a sheet with no skills.
   */
  it('is refused rather than read as though it had this shape', async () => {
    const keeper = await createUserRow({ status: 'ACTIVE' })
    const player = await createUserRow({ status: 'ACTIVE' })
    const campaign = await createCampaignRow({ ownerId: keeper.id })
    await addMemberRow({ campaignId: campaign.id, userId: player.id })
    const investigatorId = await createCharacter(player.id)

    const bindingId = newId()
    await db.insert(campaignInvestigator).values({
      id: bindingId,
      campaignId: campaign.id,
      investigatorId,
      linkedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    })

    const sessionId = newId()
    await db.insert(gameSession).values({
      id: sessionId,
      campaignId: campaign.id,
      title: 'Chapter One',
      status: 'COMPLETED',
      searchWindowStart: '2026-10-05',
      searchWindowEnd: '2026-10-18',
      gridStartHour: 16,
      gridEndHour: 24,
      minSessionHours: 6,
      quorum: 1,
      timezone: 'Europe/Warsaw',
      startedAt: NOW,
      createdBy: keeper.id,
      createdAt: NOW,
      updatedAt: NOW,
    })

    const participantId = newId()
    await db.insert(sessionParticipant).values({
      id: participantId,
      gameSessionId: sessionId,
      userId: player.id,
      priority: 'PREFERRED',
      isKeeper: false,
      playsInvestigator: true,
      createdAt: NOW,
      updatedAt: NOW,
    })

    const snapshotIds = [newId(), newId()]
    for (const id of snapshotIds) {
      await db.insert(investigatorSnapshot).values({
        id,
        investigatorId,
        kind: 'SESSION_START',
        gameSessionId: sessionId,
        schemaVersion: 99,
        // Shaped like a future version: no `sheet` at the top level.
        state: { schemaVersion: 99, character: {} },
        createdAt: NOW,
      })
    }

    await db.transaction((tx) =>
      assignInvestigator({
        sessionParticipantId: participantId,
        investigatorId,
        campaignInvestigatorId: bindingId,
        assignedBy: keeper.id,
        now: NOW,
        executor: tx,
      }),
    )
    await db
      .update(sessionInvestigatorAssignment)
      .set({ startSnapshotId: snapshotIds[0], endSnapshotId: snapshotIds[1] })
      .where(eq(sessionInvestigatorAssignment.sessionParticipantId, participantId))

    expect(await findSessionSnapshots({ sessionId, investigatorId, role: 'OWNER' })).toBeNull()
  })
})

describe('the in-game day for the Sanity rules', () => {
  /*
   * A session played from eight in the evening crosses UTC midnight partway
   * through. Anchoring the one-fifth rule to calendar midnight reset it in the
   * middle of the night it exists to measure.
   */
  it('is anchored to the session, not to the clock', async () => {
    const keeper = await createUserRow({ status: 'ACTIVE' })
    const player = await createUserRow({ status: 'ACTIVE' })
    const campaign = await createCampaignRow({ ownerId: keeper.id })
    await addMemberRow({ campaignId: campaign.id, userId: player.id })
    const investigatorId = await createCharacter(player.id)

    const bindingId = newId()
    await db.insert(campaignInvestigator).values({
      id: bindingId,
      campaignId: campaign.id,
      investigatorId,
      linkedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    })

    const startedAt = new Date('2026-09-14T18:00:00.000Z')
    const sessionId = newId()
    await db.insert(gameSession).values({
      id: sessionId,
      campaignId: campaign.id,
      title: 'Chapter One',
      status: 'IN_PROGRESS',
      searchWindowStart: '2026-10-05',
      searchWindowEnd: '2026-10-18',
      gridStartHour: 16,
      gridEndHour: 24,
      minSessionHours: 6,
      quorum: 1,
      timezone: 'Europe/Warsaw',
      startedAt,
      createdBy: keeper.id,
      createdAt: NOW,
      updatedAt: NOW,
    })

    const participantId = newId()
    await db.insert(sessionParticipant).values({
      id: participantId,
      gameSessionId: sessionId,
      userId: player.id,
      priority: 'PREFERRED',
      isKeeper: false,
      playsInvestigator: true,
      createdAt: NOW,
      updatedAt: NOW,
    })
    await db.transaction((tx) =>
      assignInvestigator({
        sessionParticipantId: participantId,
        investigatorId,
        campaignInvestigatorId: bindingId,
        assignedBy: keeper.id,
        now: NOW,
        executor: tx,
      }),
    )

    expect((await findLiveSessionStart({ investigatorId }))?.toISOString()).toBe(
      startedAt.toISOString(),
    )
  })

  it('is nothing when the character is not at a table', async () => {
    const owner = await createUserRow({ status: 'ACTIVE' })
    const investigatorId = await createCharacter(owner.id)

    expect(await findLiveSessionStart({ investigatorId })).toBeNull()
  })
})

describe('a request still waiting when a move is forced', () => {
  /*
   * Left open, the owner could later accept a hand-over of a character that had
   * since moved, branching a second time from a source nobody holds.
   */
  it('is visible to the forced move so it can be withdrawn', async () => {
    const from = await createUserRow({ status: 'ACTIVE' })
    const to = await createUserRow({ status: 'ACTIVE' })
    const campaign = await createCampaignRow({ ownerId: from.id })
    const investigatorId = await createCharacter(from.id)

    const transferId = newId()
    await db.insert(investigatorTransfer).values({
      id: transferId,
      campaignId: campaign.id,
      sourceInvestigatorId: investigatorId,
      fromOwnerId: from.id,
      toOwnerId: to.id,
      status: 'PENDING',
      expiresAt: new Date(NOW.getTime() + 86_400_000),
      createdAt: NOW,
      updatedAt: NOW,
    })

    expect((await findPendingTransfer({ investigatorId }))?.id).toBe(transferId)
  })
})

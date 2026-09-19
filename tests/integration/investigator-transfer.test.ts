import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import {
  campaignInvestigator,
  gameSession,
  investigator,
  investigatorCharacteristic,
  investigatorFieldVisibility,
  investigatorLineage,
  investigatorProfile,
  investigatorSkill,
  investigatorTransfer,
  investigatorState,
  sessionInvestigatorAssignment,
  sessionParticipant,
} from '@/db/schema'
import { newId } from '@/lib/ids'
import { assignInvestigator } from '@/modules/investigators/data/assignments'
import { branchInvestigator } from '@/modules/investigators/data/branching'
import { loadSheet } from '@/modules/investigators/data/sheet'
import {
  attachContinuation,
  createTransferRequest,
  expirePendingTransfers,
  findTransfer,
  hasPendingTransfer,
  redirectToBranch,
  settleTransfer,
} from '@/modules/investigators/data/transfers'
import { addMemberRow, createCampaignRow, createUserRow, truncateAll } from './helpers/fixtures'

/**
 * Handing a character over.
 *
 * The promise being tested is that nobody loses anything: the previous owner
 * keeps the branch they played, exactly as it was, and history is not rewritten
 * to say somebody else was at a table they were not.
 */
const NOW = new Date('2026-09-14T12:00:00.000Z')

async function createCharacter(ownerId: string, name: string) {
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
    firstUsedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
  })
  await db
    .insert(investigatorProfile)
    .values({ investigatorId, name, age: 34, createdAt: NOW, updatedAt: NOW })
  await db.insert(investigatorCharacteristic).values({
    investigatorId,
    strength: 50,
    constitution: 60,
    size: 55,
    power: 75,
    createdAt: NOW,
    updatedAt: NOW,
  })
  await db.insert(investigatorState).values({
    investigatorId,
    hitPoints: 7,
    sanity: 52,
    createdAt: NOW,
    updatedAt: NOW,
  })
  await db.insert(investigatorSkill).values({
    id: newId(),
    investigatorId,
    definitionId: 'library-use',
    specializationKey: '',
    baseValue: 20,
    occupationPoints: 40,
    currentValue: 60,
    isOccupationSkill: true,
    createdAt: NOW,
    updatedAt: NOW,
  })
  await db.insert(investigatorFieldVisibility).values({
    id: newId(),
    investigatorId,
    fieldKey: 'identity.age',
    visibility: 'HIDDEN',
    createdAt: NOW,
    updatedAt: NOW,
  })

  return { investigatorId, lineageId }
}

beforeEach(async () => {
  await truncateAll()
})

describe('branchInvestigator', () => {
  it('copies the sheet into a new character of the same lineage', async () => {
    const from = await createUserRow({ status: 'ACTIVE' })
    const to = await createUserRow({ status: 'ACTIVE' })
    const source = await createCharacter(from.id, 'Harriet Vane')

    const branchId = await db.transaction((tx) =>
      branchInvestigator({
        sourceInvestigatorId: source.investigatorId,
        newOwnerId: to.id,
        createdBy: from.id,
        now: NOW,
        executor: tx,
      }),
    )

    const [branch] = await db.select().from(investigator).where(eq(investigator.id, branchId))
    expect(branch?.ownerId).toBe(to.id)
    expect(branch?.lineageId).toBe(source.lineageId)
    expect(branch?.branchedFromId).toBe(source.investigatorId)

    const sheet = await loadSheet(branchId)
    expect(sheet.identity.name).toBe('Harriet Vane')
    expect(sheet.hitPoints.current).toBe(7)
    expect(sheet.skills).toHaveLength(1)
    expect(sheet.skills[0]?.currentValue).toBe(60)
  })

  /*
   * A continuation that started wide open would publish everything the previous
   * owner had chosen to keep back, in the same campaign, to the same people.
   */
  it('carries the privacy settings across', async () => {
    const from = await createUserRow({ status: 'ACTIVE' })
    const to = await createUserRow({ status: 'ACTIVE' })
    const source = await createCharacter(from.id, 'Harriet Vane')

    const branchId = await db.transaction((tx) =>
      branchInvestigator({
        sourceInvestigatorId: source.investigatorId,
        newOwnerId: to.id,
        createdBy: from.id,
        now: NOW,
        executor: tx,
      }),
    )

    const rows = await db
      .select()
      .from(investigatorFieldVisibility)
      .where(eq(investigatorFieldVisibility.investigatorId, branchId))

    expect(rows).toHaveLength(1)
    expect(rows[0]?.fieldKey).toBe('identity.age')
  })

  it('leaves the original untouched and still owned', async () => {
    const from = await createUserRow({ status: 'ACTIVE' })
    const to = await createUserRow({ status: 'ACTIVE' })
    const source = await createCharacter(from.id, 'Harriet Vane')

    const branchId = await db.transaction((tx) =>
      branchInvestigator({
        sourceInvestigatorId: source.investigatorId,
        newOwnerId: to.id,
        createdBy: from.id,
        now: NOW,
        executor: tx,
      }),
    )

    await db
      .update(investigatorState)
      .set({ hitPoints: 1 })
      .where(eq(investigatorState.investigatorId, branchId))

    const original = await loadSheet(source.investigatorId)
    expect(original.ownerId).toBe(from.id)
    expect(original.hitPoints.current).toBe(7)
  })

  it('keeps the first use, so a creating Keeper does not get the pen back', async () => {
    const from = await createUserRow({ status: 'ACTIVE' })
    const to = await createUserRow({ status: 'ACTIVE' })
    const source = await createCharacter(from.id, 'Harriet Vane')

    const branchId = await db.transaction((tx) =>
      branchInvestigator({
        sourceInvestigatorId: source.investigatorId,
        newOwnerId: to.id,
        createdBy: from.id,
        now: NOW,
        executor: tx,
      }),
    )

    const [branch] = await db.select().from(investigator).where(eq(investigator.id, branchId))
    expect(branch?.firstUsedAt).not.toBeNull()
  })
})

describe('redirectToBranch', () => {
  async function seedCampaignAndSession(input: {
    keeperId: string
    playerId: string
    investigatorId: string
    status: 'SCHEDULED' | 'COMPLETED'
  }) {
    const campaign = await createCampaignRow({ ownerId: input.keeperId })
    await addMemberRow({ campaignId: campaign.id, userId: input.playerId })

    const bindingId = newId()
    await db.insert(campaignInvestigator).values({
      id: bindingId,
      campaignId: campaign.id,
      investigatorId: input.investigatorId,
      linkedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    })

    const sessionId = newId()
    await db.insert(gameSession).values({
      id: sessionId,
      campaignId: campaign.id,
      title: 'Chapter Two',
      status: input.status,
      searchWindowStart: '2026-10-05',
      searchWindowEnd: '2026-10-18',
      gridStartHour: 16,
      gridEndHour: 24,
      minSessionHours: 6,
      quorum: 1,
      timezone: 'Europe/Warsaw',
      startedAt: input.status === 'COMPLETED' ? NOW : null,
      createdBy: input.keeperId,
      createdAt: NOW,
      updatedAt: NOW,
    })

    const participantId = newId()
    await db.insert(sessionParticipant).values({
      id: participantId,
      gameSessionId: sessionId,
      userId: input.playerId,
      priority: 'PREFERRED',
      isKeeper: false,
      playsInvestigator: true,
      createdAt: NOW,
      updatedAt: NOW,
    })

    await db.transaction((tx) =>
      assignInvestigator({
        sessionParticipantId: participantId,
        investigatorId: input.investigatorId,
        campaignInvestigatorId: bindingId,
        assignedBy: input.keeperId,
        now: NOW,
        executor: tx,
      }),
    )

    return { campaignId: campaign.id, sessionId, participantId }
  }

  it('moves the binding and the sessions that have not happened', async () => {
    const keeper = await createUserRow({ status: 'ACTIVE' })
    const to = await createUserRow({ status: 'ACTIVE' })
    const source = await createCharacter(to.id, 'Harriet Vane')
    const seeded = await seedCampaignAndSession({
      keeperId: keeper.id,
      playerId: to.id,
      investigatorId: source.investigatorId,
      status: 'SCHEDULED',
    })

    const branchId = await db.transaction((tx) =>
      branchInvestigator({
        sourceInvestigatorId: source.investigatorId,
        newOwnerId: to.id,
        createdBy: keeper.id,
        now: NOW,
        executor: tx,
      }),
    )

    const outcome = await db.transaction((tx) =>
      redirectToBranch({
        campaignId: seeded.campaignId,
        sourceInvestigatorId: source.investigatorId,
        branchInvestigatorId: branchId,
        newOwnerId: to.id,
        now: NOW,
        executor: tx,
      }),
    )

    expect(outcome.reassignedSessions).toBe(1)

    const bindings = await db
      .select()
      .from(campaignInvestigator)
      .where(eq(campaignInvestigator.campaignId, seeded.campaignId))
    expect(bindings.filter((binding) => binding.unlinkedAt === null)).toHaveLength(1)
    expect(bindings.find((binding) => binding.unlinkedAt === null)?.investigatorId).toBe(branchId)

    const [assignment] = await db
      .select()
      .from(sessionInvestigatorAssignment)
      .where(eq(sessionInvestigatorAssignment.sessionParticipantId, seeded.participantId))
    expect(assignment?.investigatorId).toBe(branchId)
  })

  /*
   * A session that was played was played by the character as it was then.
   * Rewriting its assignment would make history say somebody was at a table
   * they were not.
   */
  it('leaves a session that already happened alone', async () => {
    const keeper = await createUserRow({ status: 'ACTIVE' })
    const to = await createUserRow({ status: 'ACTIVE' })
    const source = await createCharacter(to.id, 'Harriet Vane')
    const seeded = await seedCampaignAndSession({
      keeperId: keeper.id,
      playerId: to.id,
      investigatorId: source.investigatorId,
      status: 'COMPLETED',
    })

    const branchId = await db.transaction((tx) =>
      branchInvestigator({
        sourceInvestigatorId: source.investigatorId,
        newOwnerId: to.id,
        createdBy: keeper.id,
        now: NOW,
        executor: tx,
      }),
    )

    const outcome = await db.transaction((tx) =>
      redirectToBranch({
        campaignId: seeded.campaignId,
        sourceInvestigatorId: source.investigatorId,
        branchInvestigatorId: branchId,
        newOwnerId: to.id,
        now: NOW,
        executor: tx,
      }),
    )

    expect(outcome.reassignedSessions).toBe(0)

    const [assignment] = await db
      .select()
      .from(sessionInvestigatorAssignment)
      .where(eq(sessionInvestigatorAssignment.sessionParticipantId, seeded.participantId))
    expect(assignment?.investigatorId).toBe(source.investigatorId)
  })

  /*
   * An upcoming session where the previous owner is still the one sitting there
   * cannot point at a character they no longer own. The seat is cleared so the
   * Keeper is told it is empty.
   */
  it('clears an upcoming assignment belonging to the previous owner', async () => {
    const keeper = await createUserRow({ status: 'ACTIVE' })
    const from = await createUserRow({ status: 'ACTIVE' })
    const to = await createUserRow({ status: 'ACTIVE' })
    const source = await createCharacter(from.id, 'Harriet Vane')
    const seeded = await seedCampaignAndSession({
      keeperId: keeper.id,
      playerId: from.id,
      investigatorId: source.investigatorId,
      status: 'SCHEDULED',
    })
    await addMemberRow({ campaignId: seeded.campaignId, userId: to.id })

    const branchId = await db.transaction((tx) =>
      branchInvestigator({
        sourceInvestigatorId: source.investigatorId,
        newOwnerId: to.id,
        createdBy: keeper.id,
        now: NOW,
        executor: tx,
      }),
    )

    await db.transaction((tx) =>
      redirectToBranch({
        campaignId: seeded.campaignId,
        sourceInvestigatorId: source.investigatorId,
        branchInvestigatorId: branchId,
        newOwnerId: to.id,
        now: NOW,
        executor: tx,
      }),
    )

    const assignments = await db
      .select()
      .from(sessionInvestigatorAssignment)
      .where(eq(sessionInvestigatorAssignment.sessionParticipantId, seeded.participantId))

    expect(assignments).toHaveLength(0)
  })
})

describe('the request itself', () => {
  async function seedRequest(input: { fromId: string; toId: string; expiresAt: Date }) {
    const campaign = await createCampaignRow({ ownerId: input.fromId })
    await addMemberRow({ campaignId: campaign.id, userId: input.toId })
    const source = await createCharacter(input.fromId, 'Harriet Vane')

    const transferId = await db.transaction((tx) =>
      createTransferRequest({
        campaignId: campaign.id,
        investigatorId: source.investigatorId,
        fromOwnerId: input.fromId,
        toOwnerId: input.toId,
        requestedBy: input.fromId,
        reason: 'She is leaving the country',
        expiresAt: input.expiresAt,
        now: NOW,
        executor: tx,
      }),
    )

    return { transferId, campaignId: campaign.id, investigatorId: source.investigatorId }
  }

  it('names both owners, not the same person twice', async () => {
    const from = await createUserRow({ status: 'ACTIVE', name: 'Eleanor' })
    const to = await createUserRow({ status: 'ACTIVE', name: 'Marcus' })
    const seeded = await seedRequest({
      fromId: from.id,
      toId: to.id,
      expiresAt: new Date(NOW.getTime() + 86_400_000),
    })

    const transfer = await findTransfer(seeded.transferId)

    expect(transfer.fromOwnerName).toBe('Eleanor')
    expect(transfer.toOwnerName).toBe('Marcus')
    expect(transfer.investigatorName).toBe('Harriet Vane')
  })

  it('blocks a second request while one is open', async () => {
    const from = await createUserRow({ status: 'ACTIVE' })
    const to = await createUserRow({ status: 'ACTIVE' })
    const seeded = await seedRequest({
      fromId: from.id,
      toId: to.id,
      expiresAt: new Date(NOW.getTime() + 86_400_000),
    })

    expect(await hasPendingTransfer({ investigatorId: seeded.investigatorId })).toBe(true)

    await db.transaction((tx) =>
      settleTransfer({ transferId: seeded.transferId, status: 'REJECTED', now: NOW, executor: tx }),
    )

    expect(await hasPendingTransfer({ investigatorId: seeded.investigatorId })).toBe(false)
  })

  /*
   * Settling claims the request by moving it out of PENDING; the branch does not
   * exist yet at that point. Recording it afterwards therefore cannot be
   * conditional on the status, or it would silently do nothing.
   */
  it('records which branch the transfer produced', async () => {
    const from = await createUserRow({ status: 'ACTIVE' })
    const to = await createUserRow({ status: 'ACTIVE' })
    const seeded = await seedRequest({
      fromId: from.id,
      toId: to.id,
      expiresAt: new Date(NOW.getTime() + 86_400_000),
    })

    const branchId = await db.transaction(async (tx) => {
      await settleTransfer({
        transferId: seeded.transferId,
        status: 'ACCEPTED',
        now: NOW,
        executor: tx,
      })

      const branch = await branchInvestigator({
        sourceInvestigatorId: seeded.investigatorId,
        newOwnerId: to.id,
        createdBy: from.id,
        now: NOW,
        executor: tx,
      })

      await attachContinuation({
        transferId: seeded.transferId,
        continuationInvestigatorId: branch,
        now: NOW,
        executor: tx,
      })

      return branch
    })

    const [row] = await db
      .select()
      .from(investigatorTransfer)
      .where(eq(investigatorTransfer.id, seeded.transferId))

    expect(row?.status).toBe('ACCEPTED')
    expect(row?.continuationInvestigatorId).toBe(branchId)
  })

  it('only one of two concurrent answers wins', async () => {
    const from = await createUserRow({ status: 'ACTIVE' })
    const to = await createUserRow({ status: 'ACTIVE' })
    const seeded = await seedRequest({
      fromId: from.id,
      toId: to.id,
      expiresAt: new Date(NOW.getTime() + 86_400_000),
    })

    const results = await Promise.all([
      db.transaction((tx) =>
        settleTransfer({
          transferId: seeded.transferId,
          status: 'ACCEPTED',
          now: NOW,
          executor: tx,
        }),
      ),
      db.transaction((tx) =>
        settleTransfer({
          transferId: seeded.transferId,
          status: 'REJECTED',
          now: NOW,
          executor: tx,
        }),
      ),
    ])

    expect(results.filter(Boolean)).toHaveLength(1)
  })

  it('lapses what nobody answered, and only that', async () => {
    const from = await createUserRow({ status: 'ACTIVE' })
    const to = await createUserRow({ status: 'ACTIVE' })

    const lapsed = await seedRequest({
      fromId: from.id,
      toId: to.id,
      expiresAt: new Date(NOW.getTime() - 1000),
    })
    const open = await seedRequest({
      fromId: from.id,
      toId: to.id,
      expiresAt: new Date(NOW.getTime() + 86_400_000),
    })

    const expired = await db.transaction((tx) => expirePendingTransfers({ now: NOW, executor: tx }))

    expect(expired).toEqual([lapsed.transferId])
    expect((await findTransfer(lapsed.transferId)).status).toBe('EXPIRED')
    expect((await findTransfer(open.transferId)).status).toBe('PENDING')
  })
})

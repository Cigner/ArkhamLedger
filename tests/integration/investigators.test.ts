import { beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import {
  campaignInvestigator,
  gameSession,
  investigator,
  investigatorAccessGrant,
  investigatorEditGrant,
  investigatorLineage,
  sessionInvestigatorAssignment,
  sessionParticipant,
} from '@/db/schema'
import { newId } from '@/lib/ids'
import { ForbiddenError, NotFoundError } from '@/lib/errors'
import { addMemberRow, createCampaignRow, createUserRow, truncateAll } from './helpers/fixtures'

/**
 * Investigator authorization against real rows.
 *
 * The role a viewer holds is assembled from three separate tables, which is
 * exactly the kind of thing that passes a unit test and then resolves wrongly
 * against a join. The refusals matter more than the permissions here: a Keeper
 * who has left, a campaign that has been unlinked, and a stranger holding an
 * identifier all have to come back with nothing.
 */
const NOW = new Date('2026-09-14T12:00:00.000Z')

const viewer = { id: '' }

vi.mock('@/lib/auth', () => ({
  requireUser: () => Promise.resolve({ id: viewer.id, role: 'USER', status: 'ACTIVE' }),
}))

const { requireInvestigatorAccess } = await import('@/modules/investigators/data/guards')
const { listAssignedInvestigators, listSessionAssignments } =
  await import('@/modules/investigators/data/assignments')
const { closeEditGrants } = await import('@/modules/investigators/data/grants')
const { assignInvestigator, findPreviousAssignments, listAssignmentRows } =
  await import('@/modules/investigators/data/assignments')
const { findLiveSessionFor, linkInvestigator, listOwnInvestigators } =
  await import('@/modules/investigators/data/campaign-bindings')
const { markFirstUse } = await import('@/modules/investigators/data/investigator-store')

async function createInvestigatorRow(input: { ownerId: string; creatorId?: string }) {
  const lineageId = newId()
  const investigatorId = newId()

  await db.insert(investigatorLineage).values({
    id: lineageId,
    createdBy: input.creatorId ?? input.ownerId,
    createdAt: NOW,
  })

  await db.insert(investigator).values({
    id: investigatorId,
    lineageId,
    ownerId: input.ownerId,
    creatorId: input.creatorId ?? input.ownerId,
    status: 'ACTIVE',
    creationMethod: 'STANDARD_ROLLS',
    rulesetId: 'coc7-classic-1920s',
    rulesetVersion: '1.0.0',
    era: 'CLASSIC_1920S',
    createdAt: NOW,
    updatedAt: NOW,
  })

  return investigatorId
}

async function linkToCampaign(input: {
  investigatorId: string
  campaignId: string
  unlinked?: boolean
}) {
  const id = newId()
  await db.insert(campaignInvestigator).values({
    id,
    campaignId: input.campaignId,
    investigatorId: input.investigatorId,
    linkedAt: NOW,
    unlinkedAt: input.unlinked ? NOW : null,
    createdAt: NOW,
    updatedAt: NOW,
  })
  return id
}

beforeEach(async () => {
  await truncateAll()
})

describe('requireInvestigatorAccess', () => {
  it('resolves the owner without any campaign at all', async () => {
    const owner = await createUserRow({ status: 'ACTIVE' })
    const investigatorId = await createInvestigatorRow({ ownerId: owner.id })
    viewer.id = owner.id

    const context = await requireInvestigatorAccess(investigatorId, 'EDIT_SHEET')

    expect(context.role).toBe('OWNER')
    expect(context.ownerId).toBe(owner.id)
  })

  /*
   * Not forbidden: not found. A 403 would let anybody holding an identifier
   * confirm that a character exists and that somebody owns it.
   */
  it('hides the Investigator from a stranger', async () => {
    const owner = await createUserRow({ status: 'ACTIVE' })
    const stranger = await createUserRow({ status: 'ACTIVE' })
    const investigatorId = await createInvestigatorRow({ ownerId: owner.id })
    viewer.id = stranger.id

    await expect(requireInvestigatorAccess(investigatorId, 'VIEW_CURRENT')).rejects.toBeInstanceOf(
      NotFoundError,
    )
  })

  it('gives the Keeper of a linked campaign the full view but never the pen', async () => {
    const owner = await createUserRow({ status: 'ACTIVE' })
    const keeper = await createUserRow({ status: 'ACTIVE' })
    const campaign = await createCampaignRow({ ownerId: keeper.id })
    await addMemberRow({ campaignId: campaign.id, userId: owner.id })
    const investigatorId = await createInvestigatorRow({ ownerId: owner.id })
    await linkToCampaign({ investigatorId, campaignId: campaign.id })
    viewer.id = keeper.id

    const context = await requireInvestigatorAccess(investigatorId, 'VIEW_FULL')
    expect(context.role).toBe('KEEPER')

    await expect(requireInvestigatorAccess(investigatorId, 'EDIT_SHEET')).rejects.toBeInstanceOf(
      ForbiddenError,
    )
  })

  it('gives another player in the campaign the redacted view only', async () => {
    const owner = await createUserRow({ status: 'ACTIVE' })
    const keeper = await createUserRow({ status: 'ACTIVE' })
    const player = await createUserRow({ status: 'ACTIVE' })
    const campaign = await createCampaignRow({ ownerId: keeper.id })
    await addMemberRow({ campaignId: campaign.id, userId: owner.id })
    await addMemberRow({ campaignId: campaign.id, userId: player.id })
    const investigatorId = await createInvestigatorRow({ ownerId: owner.id })
    await linkToCampaign({ investigatorId, campaignId: campaign.id })
    viewer.id = player.id

    const context = await requireInvestigatorAccess(investigatorId, 'VIEW_CURRENT')
    expect(context.role).toBe('PLAYER')

    await expect(requireInvestigatorAccess(investigatorId, 'VIEW_FULL')).rejects.toBeInstanceOf(
      ForbiddenError,
    )
  })

  /*
   * Unlinking ends live access for everybody in the campaign. What a former
   * Keeper keeps is the disclosure captured at that moment, which is why the
   * grant row alone resolves to HISTORICAL and not back to KEEPER.
   */
  it('drops a Keeper to historical access once the character is unlinked', async () => {
    const owner = await createUserRow({ status: 'ACTIVE' })
    const keeper = await createUserRow({ status: 'ACTIVE' })
    const campaign = await createCampaignRow({ ownerId: keeper.id })
    await addMemberRow({ campaignId: campaign.id, userId: owner.id })
    const investigatorId = await createInvestigatorRow({ ownerId: owner.id })
    await linkToCampaign({ investigatorId, campaignId: campaign.id, unlinked: true })
    await db.insert(investigatorAccessGrant).values({
      id: newId(),
      investigatorId,
      viewerId: keeper.id,
      campaignId: campaign.id,
      level: 'KEEPER',
      grantedAt: NOW,
      endedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    })
    viewer.id = keeper.id

    await expect(requireInvestigatorAccess(investigatorId, 'VIEW_CURRENT')).rejects.toBeInstanceOf(
      ForbiddenError,
    )
  })

  it('lets the creating Keeper edit until the character is first used', async () => {
    const owner = await createUserRow({ status: 'ACTIVE' })
    const keeper = await createUserRow({ status: 'ACTIVE' })
    const campaign = await createCampaignRow({ ownerId: keeper.id })
    await addMemberRow({ campaignId: campaign.id, userId: owner.id })
    const investigatorId = await createInvestigatorRow({
      ownerId: owner.id,
      creatorId: keeper.id,
    })
    await db.insert(investigatorEditGrant).values({
      id: newId(),
      investigatorId,
      campaignId: campaign.id,
      keeperId: keeper.id,
      grantedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    })
    viewer.id = keeper.id

    const before = await requireInvestigatorAccess(investigatorId, 'EDIT_SHEET')
    expect(before.role).toBe('CREATOR_KEEPER')

    await db
      .update(investigator)
      .set({ firstUsedAt: NOW })
      .where(eq(investigator.id, investigatorId))

    await expect(requireInvestigatorAccess(investigatorId, 'EDIT_SHEET')).rejects.toBeInstanceOf(
      NotFoundError,
    )
  })
})

describe('listSessionAssignments', () => {
  it('maps each participant to the character they are playing', async () => {
    const keeper = await createUserRow({ status: 'ACTIVE' })
    const player = await createUserRow({ status: 'ACTIVE' })
    const campaign = await createCampaignRow({ ownerId: keeper.id })
    await addMemberRow({ campaignId: campaign.id, userId: player.id })

    const sessionId = newId()
    await db.insert(gameSession).values({
      id: sessionId,
      campaignId: campaign.id,
      title: 'Chapter Two',
      status: 'SCHEDULED',
      searchWindowStart: '2026-10-05',
      searchWindowEnd: '2026-10-18',
      gridStartHour: 16,
      gridEndHour: 24,
      minSessionHours: 6,
      quorum: 1,
      timezone: 'Europe/Warsaw',
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

    const investigatorId = await createInvestigatorRow({ ownerId: player.id })
    const bindingId = await linkToCampaign({ investigatorId, campaignId: campaign.id })

    await db.insert(sessionInvestigatorAssignment).values({
      id: newId(),
      sessionParticipantId: participantId,
      investigatorId,
      campaignInvestigatorId: bindingId,
      assignedBy: keeper.id,
      createdAt: NOW,
      updatedAt: NOW,
    })

    const assignments = await listSessionAssignments(sessionId)

    expect(assignments.get(player.id)).toBe(investigatorId)
    expect(assignments.size).toBe(1)
  })

  it('is empty for a session nobody has been assigned in', async () => {
    const keeper = await createUserRow({ status: 'ACTIVE' })
    const campaign = await createCampaignRow({ ownerId: keeper.id })
    const sessionId = newId()
    await db.insert(gameSession).values({
      id: sessionId,
      campaignId: campaign.id,
      title: 'Chapter One',
      status: 'SCHEDULED',
      searchWindowStart: '2026-10-05',
      searchWindowEnd: '2026-10-18',
      gridStartHour: 16,
      gridEndHour: 24,
      minSessionHours: 6,
      quorum: 1,
      timezone: 'Europe/Warsaw',
      createdBy: keeper.id,
      createdAt: NOW,
      updatedAt: NOW,
    })

    expect((await listSessionAssignments(sessionId)).size).toBe(0)
  })
})

/**
 * What starting a session does to the characters it is played with.
 *
 * Each step is idempotent or conditional on purpose: a Keeper who presses start
 * twice, or a second session with the same character, must not move the moment
 * the sheet became the player's own.
 */
describe('first use', () => {
  it('stamps the first use once and never again', async () => {
    const owner = await createUserRow({ status: 'ACTIVE' })
    const investigatorId = await createInvestigatorRow({ ownerId: owner.id })

    const first = await db.transaction((tx) =>
      markFirstUse({ investigatorId, now: NOW, executor: tx }),
    )
    const later = new Date(NOW.getTime() + 86_400_000)
    const second = await db.transaction((tx) =>
      markFirstUse({ investigatorId, now: later, executor: tx }),
    )

    expect(first).toBe(true)
    expect(second).toBe(false)

    const [row] = await db.select().from(investigator).where(eq(investigator.id, investigatorId))
    expect(row?.firstUsedAt?.toISOString()).toBe(NOW.toISOString())
  })

  it('closes the creating Keeper\u2019s grant and names who lost it', async () => {
    const owner = await createUserRow({ status: 'ACTIVE' })
    const keeper = await createUserRow({ status: 'ACTIVE' })
    const campaign = await createCampaignRow({ ownerId: keeper.id })
    await addMemberRow({ campaignId: campaign.id, userId: owner.id })
    const investigatorId = await createInvestigatorRow({ ownerId: owner.id, creatorId: keeper.id })

    await db.insert(investigatorEditGrant).values({
      id: newId(),
      investigatorId,
      campaignId: campaign.id,
      keeperId: keeper.id,
      grantedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    })

    const closed = await db.transaction((tx) =>
      closeEditGrants({ investigatorId, reason: 'FIRST_USE', now: NOW, executor: tx }),
    )
    expect(closed.keeperIds).toEqual([keeper.id])

    const again = await db.transaction((tx) =>
      closeEditGrants({ investigatorId, reason: 'FIRST_USE', now: NOW, executor: tx }),
    )
    expect(again.keeperIds).toEqual([])

    viewer.id = keeper.id
    await expect(requireInvestigatorAccess(investigatorId, 'EDIT_SHEET')).rejects.toBeInstanceOf(
      NotFoundError,
    )
  })
})

describe('listAssignedInvestigators', () => {
  it('reports the owner and the binding, so a start can check both', async () => {
    const keeper = await createUserRow({ status: 'ACTIVE' })
    const player = await createUserRow({ status: 'ACTIVE' })
    const campaign = await createCampaignRow({ ownerId: keeper.id })
    await addMemberRow({ campaignId: campaign.id, userId: player.id })

    const sessionId = newId()
    await db.insert(gameSession).values({
      id: sessionId,
      campaignId: campaign.id,
      title: 'Chapter Two',
      status: 'SCHEDULED',
      searchWindowStart: '2026-10-05',
      searchWindowEnd: '2026-10-18',
      gridStartHour: 16,
      gridEndHour: 24,
      minSessionHours: 6,
      quorum: 1,
      timezone: 'Europe/Warsaw',
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

    const investigatorId = await createInvestigatorRow({ ownerId: player.id })
    const bindingId = await linkToCampaign({ investigatorId, campaignId: campaign.id })
    await db.insert(sessionInvestigatorAssignment).values({
      id: newId(),
      sessionParticipantId: participantId,
      investigatorId,
      campaignInvestigatorId: bindingId,
      assignedBy: keeper.id,
      createdAt: NOW,
      updatedAt: NOW,
    })

    const assigned = await listAssignedInvestigators(sessionId)

    expect(assigned).toEqual([
      { investigatorId, ownerId: player.id, playerId: player.id, campaignId: campaign.id },
    ])
  })
})

/**
 * Bringing characters into campaigns.
 *
 * The rules are enforced above this, so what is checked here is the shape of
 * the data underneath them: that re-linking reuses the binding the unique index
 * insists on, that a Vault listing never reaches past its owner, and that only
 * a session actually in progress counts as holding a character.
 */
describe('campaign bindings', () => {
  it('reuses the binding when a character returns to a campaign', async () => {
    const owner = await createUserRow({ status: 'ACTIVE' })
    const campaign = await createCampaignRow({ ownerId: owner.id })
    const investigatorId = await createInvestigatorRow({ ownerId: owner.id })

    const first = await db.transaction((tx) =>
      linkInvestigator({
        investigatorId,
        campaignId: campaign.id,
        linkedBy: owner.id,
        now: NOW,
        executor: tx,
      }),
    )

    await db
      .update(campaignInvestigator)
      .set({ unlinkedAt: NOW })
      .where(eq(campaignInvestigator.id, first))

    const second = await db.transaction((tx) =>
      linkInvestigator({
        investigatorId,
        campaignId: campaign.id,
        linkedBy: owner.id,
        now: NOW,
        executor: tx,
      }),
    )

    expect(second).toBe(first)

    const bindings = await db
      .select()
      .from(campaignInvestigator)
      .where(eq(campaignInvestigator.investigatorId, investigatorId))
    expect(bindings).toHaveLength(1)
    expect(bindings[0]?.unlinkedAt).toBeNull()
  })

  /*
   * A Keeper never sees a player's Vault. The listing is by owner, so the only
   * way to read somebody else's characters is to be them.
   */
  it('lists only the caller\u2019s own characters', async () => {
    const owner = await createUserRow({ status: 'ACTIVE' })
    const other = await createUserRow({ status: 'ACTIVE' })
    const mine = await createInvestigatorRow({ ownerId: owner.id })
    await createInvestigatorRow({ ownerId: other.id })

    viewer.id = owner.id
    const listed = await listOwnInvestigators()

    expect(listed.map((entry) => entry.investigatorId)).toEqual([mine])
  })

  it('reports which campaigns a character is already in', async () => {
    const owner = await createUserRow({ status: 'ACTIVE' })
    const campaign = await createCampaignRow({ ownerId: owner.id })
    const investigatorId = await createInvestigatorRow({ ownerId: owner.id })
    await linkToCampaign({ investigatorId, campaignId: campaign.id })

    viewer.id = owner.id
    const [listed] = await listOwnInvestigators()

    expect(listed?.linkedCampaignIds).toEqual([campaign.id])
  })

  it('counts only a session that has actually started as holding a character', async () => {
    const keeper = await createUserRow({ status: 'ACTIVE' })
    const player = await createUserRow({ status: 'ACTIVE' })
    const campaign = await createCampaignRow({ ownerId: keeper.id })
    await addMemberRow({ campaignId: campaign.id, userId: player.id })

    const sessionId = newId()
    await db.insert(gameSession).values({
      id: sessionId,
      campaignId: campaign.id,
      title: 'Chapter Two',
      status: 'SCHEDULED',
      searchWindowStart: '2026-10-05',
      searchWindowEnd: '2026-10-18',
      gridStartHour: 16,
      gridEndHour: 24,
      minSessionHours: 6,
      quorum: 1,
      timezone: 'Europe/Warsaw',
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

    const investigatorId = await createInvestigatorRow({ ownerId: player.id })
    const bindingId = await linkToCampaign({ investigatorId, campaignId: campaign.id })
    await db.insert(sessionInvestigatorAssignment).values({
      id: newId(),
      sessionParticipantId: participantId,
      investigatorId,
      campaignInvestigatorId: bindingId,
      assignedBy: keeper.id,
      createdAt: NOW,
      updatedAt: NOW,
    })

    expect(await findLiveSessionFor({ investigatorId })).toBeNull()

    await db
      .update(gameSession)
      .set({ status: 'IN_PROGRESS', startedAt: NOW })
      .where(eq(gameSession.id, sessionId))

    expect(await findLiveSessionFor({ investigatorId })).toEqual({
      sessionId,
      title: 'Chapter Two',
    })

    // The session doing the asking is not a conflict with itself.
    expect(await findLiveSessionFor({ investigatorId, exceptSessionId: sessionId })).toBeNull()
  })
})

/**
 * Carrying characters forward between sessions.
 *
 * "The same as last time" is the common case, and the risk in automating it is
 * doing it quietly: the copy has to come from a session that was actually
 * played, and it has to leave out anybody it could not place.
 */
describe('previous assignments', () => {
  async function seedSession(input: {
    campaignId: string
    keeperId: string
    playerId: string
    title: string
    status: 'SCHEDULED' | 'COMPLETED'
    startedAt: Date | null
  }) {
    const sessionId = newId()
    await db.insert(gameSession).values({
      id: sessionId,
      campaignId: input.campaignId,
      title: input.title,
      status: input.status,
      searchWindowStart: '2026-10-05',
      searchWindowEnd: '2026-10-18',
      gridStartHour: 16,
      gridEndHour: 24,
      minSessionHours: 6,
      quorum: 1,
      timezone: 'Europe/Warsaw',
      startedAt: input.startedAt,
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

    return { sessionId, participantId }
  }

  it('reads from the most recently started session, not the most recent', async () => {
    const keeper = await createUserRow({ status: 'ACTIVE' })
    const player = await createUserRow({ status: 'ACTIVE' })
    const campaign = await createCampaignRow({ ownerId: keeper.id })
    await addMemberRow({ campaignId: campaign.id, userId: player.id })

    const investigatorId = await createInvestigatorRow({ ownerId: player.id })
    const bindingId = await linkToCampaign({ investigatorId, campaignId: campaign.id })

    const played = await seedSession({
      campaignId: campaign.id,
      keeperId: keeper.id,
      playerId: player.id,
      title: 'Chapter One',
      status: 'COMPLETED',
      startedAt: NOW,
    })
    await db.transaction((tx) =>
      assignInvestigator({
        sessionParticipantId: played.participantId,
        investigatorId,
        campaignInvestigatorId: bindingId,
        assignedBy: keeper.id,
        now: NOW,
        executor: tx,
      }),
    )

    // Scheduled but never played: a plan, not a fact about who was there.
    const planned = await seedSession({
      campaignId: campaign.id,
      keeperId: keeper.id,
      playerId: player.id,
      title: 'Chapter Two',
      status: 'SCHEDULED',
      startedAt: null,
    })

    const previous = await findPreviousAssignments({
      campaignId: campaign.id,
      exceptSessionId: planned.sessionId,
    })

    expect(previous?.title).toBe('Chapter One')
    expect(previous?.byUserId.get(player.id)).toBe(investigatorId)
  })

  it('is nothing when the campaign has never played', async () => {
    const keeper = await createUserRow({ status: 'ACTIVE' })
    const player = await createUserRow({ status: 'ACTIVE' })
    const campaign = await createCampaignRow({ ownerId: keeper.id })
    await addMemberRow({ campaignId: campaign.id, userId: player.id })

    const planned = await seedSession({
      campaignId: campaign.id,
      keeperId: keeper.id,
      playerId: player.id,
      title: 'Chapter One',
      status: 'SCHEDULED',
      startedAt: null,
    })

    expect(
      await findPreviousAssignments({
        campaignId: campaign.id,
        exceptSessionId: planned.sessionId,
      }),
    ).toBeNull()
  })

  it('lists everybody bringing a character, chosen or not', async () => {
    const keeper = await createUserRow({ status: 'ACTIVE' })
    const player = await createUserRow({ status: 'ACTIVE' })
    const campaign = await createCampaignRow({ ownerId: keeper.id })
    await addMemberRow({ campaignId: campaign.id, userId: player.id })

    const session = await seedSession({
      campaignId: campaign.id,
      keeperId: keeper.id,
      playerId: player.id,
      title: 'Chapter One',
      status: 'SCHEDULED',
      startedAt: null,
    })

    // The Keeper is in the session but is not bringing a character.
    await db.insert(sessionParticipant).values({
      id: newId(),
      gameSessionId: session.sessionId,
      userId: keeper.id,
      priority: 'REQUIRED',
      isKeeper: true,
      playsInvestigator: false,
      createdAt: NOW,
      updatedAt: NOW,
    })

    const rows = await listAssignmentRows(session.sessionId)

    expect(rows).toHaveLength(1)
    expect(rows[0]?.userId).toBe(player.id)
    expect(rows[0]?.investigatorId).toBeNull()
  })

  it('replaces an assignment rather than adding a second', async () => {
    const keeper = await createUserRow({ status: 'ACTIVE' })
    const player = await createUserRow({ status: 'ACTIVE' })
    const campaign = await createCampaignRow({ ownerId: keeper.id })
    await addMemberRow({ campaignId: campaign.id, userId: player.id })

    const first = await createInvestigatorRow({ ownerId: player.id })
    const second = await createInvestigatorRow({ ownerId: player.id })
    const firstBinding = await linkToCampaign({ investigatorId: first, campaignId: campaign.id })
    const secondBinding = await linkToCampaign({ investigatorId: second, campaignId: campaign.id })

    const session = await seedSession({
      campaignId: campaign.id,
      keeperId: keeper.id,
      playerId: player.id,
      title: 'Chapter One',
      status: 'SCHEDULED',
      startedAt: null,
    })

    for (const [investigatorId, bindingId] of [
      [first, firstBinding],
      [second, secondBinding],
    ] as const) {
      await db.transaction((tx) =>
        assignInvestigator({
          sessionParticipantId: session.participantId,
          investigatorId,
          campaignInvestigatorId: bindingId,
          assignedBy: keeper.id,
          now: NOW,
          executor: tx,
        }),
      )
    }

    const rows = await listAssignmentRows(session.sessionId)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.investigatorId).toBe(second)
  })
})

import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import {
  campaignInvestigator,
  gameSession,
  investigator,
  investigatorAccessGrant,
  investigatorCharacteristic,
  investigatorDerivedOverride,
  investigatorFieldVisibility,
  investigatorLineage,
  investigatorProfile,
  investigatorSkill,
  investigatorSkillMark,
  investigatorSnapshot,
  investigatorState,
  sessionInvestigatorAssignment,
  sessionParticipant,
} from '@/db/schema'
import { newId } from '@/lib/ids'
import { loadHistory } from '@/modules/investigators/data/history'
import { loadSheet, setDerivedOverride } from '@/modules/investigators/data/sheet'
import {
  captureDisclosure,
  captureSnapshot,
  findLatestDisclosure,
  listCampaignViewers,
  unlinkFromCampaign,
} from '@/modules/investigators/data/snapshots'
import type { InvestigatorSheet, SheetSnapshotPayload } from '@/modules/investigators/domain/sheet'
import { addMemberRow, createCampaignRow, createUserRow, truncateAll } from './helpers/fixtures'

/**
 * Sheet assembly and permanent access.
 *
 * The promise being tested is section 15 of the plan: once somebody has been
 * shown something, they keep it. That has to survive the campaign ending, the
 * character being unlinked, and the owner hiding the field afterwards - so the
 * assertions are about what a projection captured earlier still contains, not
 * about what the live sheet says now.
 */
const NOW = new Date('2026-09-14T12:00:00.000Z')

async function createFullInvestigator(ownerId: string) {
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

  await db.insert(investigatorProfile).values({
    investigatorId,
    name: 'Harriet Vane',
    age: 34,
    residence: 'Oxford',
    species: 'Deep One hybrid',
    occupationId: 'author',
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
    startingLuck: 55,
    createdAt: NOW,
    updatedAt: NOW,
  })

  await db.insert(investigatorState).values({
    investigatorId,
    hitPoints: 8,
    sanity: 62,
    magicPoints: 15,
    luck: 55,
    majorWound: true,
    createdAt: NOW,
    updatedAt: NOW,
  })

  const skillId = newId()
  await db.insert(investigatorSkill).values({
    id: skillId,
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

  const mythosId = newId()
  await db.insert(investigatorSkill).values({
    id: mythosId,
    investigatorId,
    definitionId: 'cthulhu-mythos',
    specializationKey: '',
    baseValue: 0,
    currentValue: 9,
    createdAt: NOW,
    updatedAt: NOW,
  })

  return { investigatorId, skillId, mythosId }
}

beforeEach(async () => {
  await truncateAll()
})

describe('loadSheet', () => {
  it('calculates the values the rules derive rather than storing them', async () => {
    const owner = await createUserRow({ status: 'ACTIVE' })
    const { investigatorId } = await createFullInvestigator(owner.id)

    const sheet = await loadSheet(investigatorId)

    // CON 60 + SIZ 55 = 115, a tenth of it rounded down.
    expect(sheet.hitPoints).toEqual({ current: 8, maximum: 11 })
    // POW 75 divided by five.
    expect(sheet.magicPoints).toEqual({ current: 15, maximum: 15 })
    // 99 less Cthulhu Mythos, which is what the sheet's Sanity ceiling means.
    expect(sheet.sanity).toEqual({ current: 62, maximum: 90 })
    expect(sheet.movementRate).toBe(8)
    expect(sheet.build).toBe(0)
    expect(sheet.skills.find((skill) => skill.definitionId === 'library-use')?.thresholds).toEqual({
      regular: 60,
      hard: 30,
      extreme: 12,
    })
  })

  /*
   * A pending mark is a tick on one skill of one character. Restricting the
   * query to this character's skills is the difference between that and a tick
   * on everybody's Library Use.
   */
  it('reads development marks only from this character', async () => {
    const owner = await createUserRow({ status: 'ACTIVE' })
    const other = await createUserRow({ status: 'ACTIVE' })
    const mine = await createFullInvestigator(owner.id)
    const theirs = await createFullInvestigator(other.id)

    await db.insert(investigatorSkillMark).values({
      id: newId(),
      investigatorSkillId: theirs.skillId,
      markedAt: NOW,
    })

    const sheet = await loadSheet(mine.investigatorId)

    expect(sheet.skills.every((skill) => !skill.hasDevelopmentMark)).toBe(true)

    await db.insert(investigatorSkillMark).values({
      id: newId(),
      investigatorSkillId: mine.skillId,
      markedAt: NOW,
    })

    const marked = await loadSheet(mine.investigatorId)
    expect(
      marked.skills.find((skill) => skill.definitionId === 'library-use')?.hasDevelopmentMark,
    ).toBe(true)
  })
})

describe('captureSnapshot', () => {
  it('stores the sheet whole, without anybody’s privacy applied', async () => {
    const owner = await createUserRow({ status: 'ACTIVE' })
    const { investigatorId } = await createFullInvestigator(owner.id)
    await db.insert(investigatorFieldVisibility).values({
      id: newId(),
      investigatorId,
      fieldKey: 'identity.name',
      visibility: 'HIDDEN',
      createdAt: NOW,
      updatedAt: NOW,
    })

    const snapshotId = await db.transaction((tx) =>
      captureSnapshot({
        investigatorId,
        kind: 'SESSION_START',
        now: NOW,
        executor: tx,
      }),
    )

    const [row] = await db
      .select()
      .from(investigatorSnapshot)
      .where(eq(investigatorSnapshot.id, snapshotId))

    const payload = row?.state as SheetSnapshotPayload
    expect(payload.sheet.identity.name).toBe('Harriet Vane')
    expect(payload.schemaVersion).toBe(1)
    expect(row?.schemaVersion).toBe(1)

    /*
     * The privacy in force travels with the sheet, so any viewer's historical
     * view can be recomputed from the archive rather than stored once per person.
     */
    expect(payload.visibility).toContainEqual(['identity.name', 'HIDDEN'])
  })
})

describe('permanent access', () => {
  async function seedCampaignWithInvestigator() {
    const owner = await createUserRow({ status: 'ACTIVE', name: 'Owner' })
    const keeper = await createUserRow({ status: 'ACTIVE', name: 'Keeper' })
    const player = await createUserRow({ status: 'ACTIVE', name: 'Player' })
    const campaign = await createCampaignRow({ ownerId: keeper.id })
    await addMemberRow({ campaignId: campaign.id, userId: owner.id })
    await addMemberRow({ campaignId: campaign.id, userId: player.id })

    const { investigatorId } = await createFullInvestigator(owner.id)
    await db.insert(campaignInvestigator).values({
      id: newId(),
      campaignId: campaign.id,
      investigatorId,
      linkedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    })

    return { owner, keeper, player, campaignId: campaign.id, investigatorId }
  }

  it('lists the Keeper and the other players, never the owner', async () => {
    const seeded = await seedCampaignWithInvestigator()

    const viewers = await listCampaignViewers({
      investigatorId: seeded.investigatorId,
      campaignId: seeded.campaignId,
      executor: db,
    })

    expect(viewers).toHaveLength(2)
    expect(viewers.find((viewer) => viewer.viewerId === seeded.keeper.id)?.role).toBe('KEEPER')
    expect(viewers.find((viewer) => viewer.viewerId === seeded.player.id)?.role).toBe('PLAYER')
    expect(viewers.some((viewer) => viewer.viewerId === seeded.owner.id)).toBe(false)
  })

  it('gives each viewer the sheet they could actually see', async () => {
    const seeded = await seedCampaignWithInvestigator()
    await db.insert(investigatorFieldVisibility).values({
      id: newId(),
      investigatorId: seeded.investigatorId,
      fieldKey: 'identity.residence',
      visibility: 'HIDDEN',
      createdAt: NOW,
      updatedAt: NOW,
    })

    await db.transaction(async (tx) => {
      await captureDisclosure({
        investigatorId: seeded.investigatorId,
        viewerId: seeded.keeper.id,
        role: 'KEEPER',
        reason: 'CAMPAIGN_ENDED',
        now: NOW,
        executor: tx,
      })
      await captureDisclosure({
        investigatorId: seeded.investigatorId,
        viewerId: seeded.player.id,
        role: 'PLAYER',
        reason: 'CAMPAIGN_ENDED',
        now: NOW,
        executor: tx,
      })
    })

    const keeperKept = await findLatestDisclosure({
      investigatorId: seeded.investigatorId,
      viewerId: seeded.keeper.id,
    })
    const playerKept = await findLatestDisclosure({
      investigatorId: seeded.investigatorId,
      viewerId: seeded.player.id,
    })

    expect((keeperKept?.projection as InvestigatorSheet).identity.residence).toBe('Oxford')
    expect((playerKept?.projection as InvestigatorSheet).identity.residence).toBeNull()
  })

  /*
   * The point of the whole mechanism: what somebody was shown outlives their
   * access to the character, and outlives the owner changing their mind about
   * what is public afterwards.
   */
  it('leaves everybody what they had when the character is unlinked', async () => {
    const seeded = await seedCampaignWithInvestigator()

    const captured = await db.transaction((tx) =>
      unlinkFromCampaign({
        investigatorId: seeded.investigatorId,
        campaignId: seeded.campaignId,
        reason: 'The campaign ended',
        now: NOW,
        executor: tx,
      }),
    )

    expect(captured).toBe(2)

    const [binding] = await db
      .select()
      .from(campaignInvestigator)
      .where(eq(campaignInvestigator.investigatorId, seeded.investigatorId))
    expect(binding?.unlinkedAt).not.toBeNull()

    const grants = await db
      .select()
      .from(investigatorAccessGrant)
      .where(eq(investigatorAccessGrant.investigatorId, seeded.investigatorId))
    expect(grants).toHaveLength(2)
    expect(grants.every((grant) => grant.endedAt !== null)).toBe(true)
    expect(grants.every((grant) => grant.finalDisclosureSnapshotId !== null)).toBe(true)

    // The owner hides the name afterwards; what was disclosed does not change.
    await db.insert(investigatorFieldVisibility).values({
      id: newId(),
      investigatorId: seeded.investigatorId,
      fieldKey: 'identity.name',
      visibility: 'HIDDEN',
      createdAt: NOW,
      updatedAt: NOW,
    })

    const playerKept = await findLatestDisclosure({
      investigatorId: seeded.investigatorId,
      viewerId: seeded.player.id,
    })

    expect((playerKept?.projection as InvestigatorSheet).identity.name).toBe('Harriet Vane')
  })
})

describe('manual overrides', () => {
  it('replaces the calculated value and says who insisted', async () => {
    const owner = await createUserRow({ status: 'ACTIVE' })
    const { investigatorId } = await createFullInvestigator(owner.id)

    const before = await loadSheet(investigatorId)
    expect(before.hitPoints.maximum).toBe(11)
    expect(before.overrides).toEqual([])

    await db.insert(investigatorDerivedOverride).values({
      id: newId(),
      investigatorId,
      fieldKey: 'derived.hitPoints',
      value: '14',
      reason: 'Keeper ruling: blessed by something that should not exist',
      setBy: owner.id,
      createdAt: NOW,
      updatedAt: NOW,
    })

    const after = await loadSheet(investigatorId)
    expect(after.hitPoints.maximum).toBe(14)
    expect(after.overrides).toEqual([
      {
        fieldKey: 'derived.hitPoints',
        value: 14,
        reason: 'Keeper ruling: blessed by something that should not exist',
      },
    ])
  })

  it('is written by the sheet rather than by hand', async () => {
    const owner = await createUserRow({ status: 'ACTIVE' })
    const { investigatorId } = await createFullInvestigator(owner.id)

    await db.transaction((tx) =>
      setDerivedOverride({
        investigatorId,
        fieldKey: 'derived.sanity',
        value: 60,
        reason: 'Agreed at the table after the fire',
        setBy: owner.id,
        now: NOW,
        executor: tx,
      }),
    )

    expect((await loadSheet(investigatorId)).sanity.maximum).toBe(60)

    /*
     * Setting it again closes the first and opens a second, so the sheet shows
     * one value per field and the history keeps both decisions.
     */
    await db.transaction((tx) =>
      setDerivedOverride({
        investigatorId,
        fieldKey: 'derived.sanity',
        value: 55,
        reason: 'Corrected: it was fifty-five',
        setBy: owner.id,
        now: new Date(NOW.getTime() + 60_000),
        executor: tx,
      }),
    )

    const sheet = await loadSheet(investigatorId)
    expect(sheet.sanity.maximum).toBe(55)
    expect(sheet.overrides).toHaveLength(1)

    const rows = await db
      .select()
      .from(investigatorDerivedOverride)
      .where(eq(investigatorDerivedOverride.investigatorId, investigatorId))
    expect(rows).toHaveLength(2)
  })

  it('returns to the calculated value when it is withdrawn', async () => {
    const owner = await createUserRow({ status: 'ACTIVE' })
    const { investigatorId } = await createFullInvestigator(owner.id)

    const calculated = (await loadSheet(investigatorId)).hitPoints.maximum

    await db.transaction((tx) =>
      setDerivedOverride({
        investigatorId,
        fieldKey: 'derived.hitPoints',
        value: 14,
        reason: 'Keeper ruling',
        setBy: owner.id,
        now: NOW,
        executor: tx,
      }),
    )
    await db.transaction((tx) =>
      setDerivedOverride({
        investigatorId,
        fieldKey: 'derived.hitPoints',
        value: null,
        reason: 'Back to the rules',
        setBy: owner.id,
        now: new Date(NOW.getTime() + 60_000),
        executor: tx,
      }),
    )

    const sheet = await loadSheet(investigatorId)
    expect(sheet.hitPoints.maximum).toBe(calculated)
    expect(sheet.overrides).toEqual([])
  })

  /*
   * A withdrawn override is history, not a correction to be re-applied. The row
   * stays so the sheet can show that a number was once insisted upon.
   */
  it('ignores an override that has been withdrawn', async () => {
    const owner = await createUserRow({ status: 'ACTIVE' })
    const { investigatorId } = await createFullInvestigator(owner.id)

    await db.insert(investigatorDerivedOverride).values({
      id: newId(),
      investigatorId,
      fieldKey: 'derived.hitPoints',
      value: '14',
      reason: 'Withdrawn later',
      endedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    })

    const sheet = await loadSheet(investigatorId)
    expect(sheet.hitPoints.maximum).toBe(11)
    expect(sheet.overrides).toEqual([])
  })
})

describe('luck before play', () => {
  /*
   * A draft has no current Luck yet, so the sheet shows what was rolled. Once
   * play starts, the state row is what changes and the rolled value stops being
   * the answer.
   */
  it('shows the rolled value until the state row has one', async () => {
    const owner = await createUserRow({ status: 'ACTIVE' })
    const { investigatorId } = await createFullInvestigator(owner.id)

    await db
      .update(investigatorState)
      .set({ luck: null })
      .where(eq(investigatorState.investigatorId, investigatorId))

    expect((await loadSheet(investigatorId)).luck.current).toBe(55)

    await db
      .update(investigatorState)
      .set({ luck: 30 })
      .where(eq(investigatorState.investigatorId, investigatorId))

    expect((await loadSheet(investigatorId)).luck.current).toBe(30)
  })
})

/**
 * The history tab.
 *
 * Section 9 asks it for campaigns, sessions, snapshots and version comparison.
 * The comparison is the part with teeth: it is computed from the pair of
 * snapshots an evening took, and it has to obey the same privacy the sheet
 * above it does - otherwise hiding Sanity would hide the number and publish
 * every point of it that was lost.
 */
describe('loadHistory', () => {
  async function seedPlayedSession(input: { hideSanity: boolean }) {
    const owner = await createUserRow({ status: 'ACTIVE', name: 'Owner' })
    const keeper = await createUserRow({ status: 'ACTIVE', name: 'Keeper' })
    const campaign = await createCampaignRow({ ownerId: keeper.id, name: 'The Tatterdemalion' })
    await addMemberRow({ campaignId: campaign.id, userId: owner.id })

    const { investigatorId } = await createFullInvestigator(owner.id)
    await db.insert(campaignInvestigator).values({
      id: newId(),
      campaignId: campaign.id,
      investigatorId,
      linkedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    })

    if (input.hideSanity) {
      await db.insert(investigatorFieldVisibility).values({
        id: newId(),
        investigatorId,
        fieldKey: 'derived.sanity',
        visibility: 'HIDDEN',
        createdAt: NOW,
        updatedAt: NOW,
      })
    }

    const startSnapshotId = await db.transaction((tx) =>
      captureSnapshot({ investigatorId, kind: 'SESSION_START', now: NOW, executor: tx }),
    )

    await db
      .update(investigatorState)
      .set({ sanity: 49 })
      .where(eq(investigatorState.investigatorId, investigatorId))

    const endSnapshotId = await db.transaction((tx) =>
      captureSnapshot({ investigatorId, kind: 'SESSION_END', now: NOW, executor: tx }),
    )

    const sessionId = newId()
    await db.insert(gameSession).values({
      id: sessionId,
      campaignId: campaign.id,
      title: 'Chapter Two',
      status: 'COMPLETED',
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
      userId: owner.id,
      priority: 'PREFERRED',
      isKeeper: false,
      playsInvestigator: true,
      createdAt: NOW,
      updatedAt: NOW,
    })

    const [binding] = await db
      .select({ id: campaignInvestigator.id })
      .from(campaignInvestigator)
      .where(eq(campaignInvestigator.investigatorId, investigatorId))

    await db.insert(sessionInvestigatorAssignment).values({
      id: newId(),
      sessionParticipantId: participantId,
      investigatorId,
      campaignInvestigatorId: binding!.id,
      startSnapshotId,
      endSnapshotId,
      createdAt: NOW,
      updatedAt: NOW,
    })

    return { investigatorId, campaignId: campaign.id, sessionId }
  }

  it('lists the campaigns, the sessions and what each evening did', async () => {
    const seeded = await seedPlayedSession({ hideSanity: false })

    const history = await loadHistory({ investigatorId: seeded.investigatorId, role: 'OWNER' })

    expect(history.campaigns).toHaveLength(1)
    expect(history.campaigns[0]?.name).toBe('The Tatterdemalion')
    expect(history.campaigns[0]?.unlinkedAt).toBeNull()

    expect(history.sessions).toHaveLength(1)
    expect(history.sessions[0]?.title).toBe('Chapter Two')
    expect(history.sessions[0]?.comparison?.resources).toContainEqual({
      resource: 'SAN',
      before: 62,
      after: 49,
      delta: -13,
    })

    expect(history.snapshots.map((entry) => entry.kind)).toEqual(['SESSION_END', 'SESSION_START'])
  })

  it('withholds from the comparison what the reader may not see', async () => {
    const seeded = await seedPlayedSession({ hideSanity: true })

    const forOwner = await loadHistory({ investigatorId: seeded.investigatorId, role: 'OWNER' })
    const forPlayer = await loadHistory({
      investigatorId: seeded.investigatorId,
      role: 'PLAYER',
    })

    expect(
      forOwner.sessions[0]?.comparison?.resources.some((change) => change.resource === 'SAN'),
    ).toBe(true)
    expect(
      forPlayer.sessions[0]?.comparison?.resources.some((change) => change.resource === 'SAN'),
    ).toBe(false)
  })
})

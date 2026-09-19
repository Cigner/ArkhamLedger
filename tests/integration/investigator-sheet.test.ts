import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import {
  investigator,
  investigatorBackstoryEntry,
  investigatorCharacteristic,
  investigatorFieldVisibility,
  investigatorFinance,
  investigatorLineage,
  investigatorProfile,
  investigatorSkill,
  investigatorState,
} from '@/db/schema'
import { newId } from '@/lib/ids'
import {
  claimVersion,
  replaceBackstory,
  replaceFieldVisibility,
  replacePossessions,
  replaceWeapons,
  saveFinances,
} from '@/modules/investigators/data/investigator-store'
import { loadFieldVisibility, loadSheet } from '@/modules/investigators/data/sheet'
import { createUserRow, truncateAll } from './helpers/fixtures'

/**
 * Writing the sheet, against a real database.
 *
 * The version claim is the part that only exists in SQL: two writers starting
 * from the same read is the ordinary case here, not a race somebody has to
 * contrive.
 */
const NOW = new Date('2026-09-14T12:00:00.000Z')

async function createDraft(ownerId: string) {
  const lineageId = newId()
  const investigatorId = newId()

  await db.insert(investigatorLineage).values({ id: lineageId, createdBy: ownerId, createdAt: NOW })
  await db.insert(investigator).values({
    id: investigatorId,
    lineageId,
    ownerId,
    creatorId: ownerId,
    status: 'DRAFT',
    creationMethod: 'STANDARD_ROLLS',
    rulesetId: 'coc7-classic-1920s',
    rulesetVersion: '1.0.0',
    era: 'CLASSIC_1920S',
    createdAt: NOW,
    updatedAt: NOW,
  })
  await db.insert(investigatorProfile).values({ investigatorId, createdAt: NOW, updatedAt: NOW })
  await db
    .insert(investigatorCharacteristic)
    .values({ investigatorId, createdAt: NOW, updatedAt: NOW })
  await db.insert(investigatorState).values({ investigatorId, createdAt: NOW, updatedAt: NOW })
  await db.insert(investigatorFinance).values({ investigatorId, createdAt: NOW, updatedAt: NOW })

  return investigatorId
}

beforeEach(async () => {
  await truncateAll()
})

describe('optimistic locking', () => {
  it('lets only one of two writers from the same version win', async () => {
    const owner = await createUserRow({ status: 'ACTIVE' })
    const investigatorId = await createDraft(owner.id)

    const results = await Promise.all([
      db.transaction((tx) =>
        claimVersion({ investigatorId, expectedVersion: 0, now: NOW, executor: tx }),
      ),
      db.transaction((tx) =>
        claimVersion({ investigatorId, expectedVersion: 0, now: NOW, executor: tx }),
      ),
    ])

    expect(results.filter(Boolean)).toHaveLength(1)

    const [row] = await db.select().from(investigator).where(eq(investigator.id, investigatorId))
    expect(row?.lockVersion).toBe(1)
  })

  it('refuses a write against a version the character has left', async () => {
    const owner = await createUserRow({ status: 'ACTIVE' })
    const investigatorId = await createDraft(owner.id)

    await db.transaction((tx) =>
      claimVersion({ investigatorId, expectedVersion: 0, now: NOW, executor: tx }),
    )

    const stale = await db.transaction((tx) =>
      saveFinances({
        investigatorId,
        expectedVersion: 0,
        values: {
          cash: 100,
          assets: 0,
          spendingLevel: 10,
          assetsUnboundedAbove: false,
          notes: null,
        },
        now: NOW,
        executor: tx,
      }),
    )

    expect(stale).toBe(false)
  })
})

describe('Credit Rating', () => {
  /*
   * It is a skill, and the money is read out of it. Two stored copies would
   * eventually disagree, and the one people change is the skill.
   */
  it('comes from the skill rather than the finance row', async () => {
    const owner = await createUserRow({ status: 'ACTIVE' })
    const investigatorId = await createDraft(owner.id)

    await db
      .update(investigatorFinance)
      .set({ creditRating: 10 })
      .where(eq(investigatorFinance.investigatorId, investigatorId))

    expect((await loadSheet(investigatorId)).finances.creditRating).toBe(10)

    await db.insert(investigatorSkill).values({
      id: newId(),
      investigatorId,
      definitionId: 'credit-rating',
      specializationKey: '',
      baseValue: 0,
      currentValue: 65,
      createdAt: NOW,
      updatedAt: NOW,
    })

    expect((await loadSheet(investigatorId)).finances.creditRating).toBe(65)
  })
})

describe('backstory', () => {
  it('replaces the whole section and keeps the key connection', async () => {
    const owner = await createUserRow({ status: 'ACTIVE' })
    const investigatorId = await createDraft(owner.id)

    await db.transaction((tx) =>
      replaceBackstory({
        investigatorId,
        expectedVersion: 0,
        entries: [
          {
            category: 'TRAITS',
            content: 'Never refuses a puzzle.',
            position: 0,
            isKeyConnection: false,
          },
          {
            category: 'SIGNIFICANT_PEOPLE',
            content: 'Her tutor at Oxford.',
            position: 1,
            isKeyConnection: true,
          },
        ],
        now: NOW,
        executor: tx,
      }),
    )

    await db.transaction((tx) =>
      replaceBackstory({
        investigatorId,
        expectedVersion: 1,
        entries: [
          {
            category: 'TRAITS',
            content: 'Never refuses a puzzle.',
            position: 0,
            isKeyConnection: true,
          },
        ],
        now: NOW,
        executor: tx,
      }),
    )

    const rows = await db
      .select()
      .from(investigatorBackstoryEntry)
      .where(eq(investigatorBackstoryEntry.investigatorId, investigatorId))

    expect(rows).toHaveLength(1)
    expect(rows[0]?.category).toBe('TRAITS')
    expect(rows[0]?.isKeyConnection).toBe(true)
  })
})

describe('privacy settings', () => {
  it('stores only the exceptions', async () => {
    const owner = await createUserRow({ status: 'ACTIVE' })
    const investigatorId = await createDraft(owner.id)

    await db.transaction((tx) =>
      replaceFieldVisibility({
        investigatorId,
        hidden: ['identity.age', 'backstory.PHOBIAS_AND_MANIAS'],
        updatedBy: owner.id,
        now: NOW,
        executor: tx,
      }),
    )

    const stored = await loadFieldVisibility(investigatorId)
    expect(stored).toHaveLength(2)
    expect(stored.every(([, visibility]) => visibility === 'HIDDEN')).toBe(true)
  })

  it('replaces rather than accumulates', async () => {
    const owner = await createUserRow({ status: 'ACTIVE' })
    const investigatorId = await createDraft(owner.id)

    await db.transaction((tx) =>
      replaceFieldVisibility({
        investigatorId,
        hidden: ['identity.age', 'identity.residence'],
        updatedBy: owner.id,
        now: NOW,
        executor: tx,
      }),
    )
    await db.transaction((tx) =>
      replaceFieldVisibility({
        investigatorId,
        hidden: ['identity.age'],
        updatedBy: owner.id,
        now: NOW,
        executor: tx,
      }),
    )

    const rows = await db
      .select()
      .from(investigatorFieldVisibility)
      .where(eq(investigatorFieldVisibility.investigatorId, investigatorId))

    expect(rows).toHaveLength(1)
    expect(rows[0]?.fieldKey).toBe('identity.age')
  })
})

describe('possessions and weapons', () => {
  /*
   * Both sections replace wholesale, so the thing worth checking is that the
   * order somebody arranged them in survives the round trip: a kit list that
   * reshuffles itself on every save is one nobody trusts.
   */
  it('keeps the order the list was written in', async () => {
    const owner = await createUserRow({ status: 'ACTIVE' })
    const investigatorId = await createDraft(owner.id)

    await db.transaction((tx) =>
      replacePossessions({
        investigatorId,
        expectedVersion: 0,
        entries: [
          { name: 'Notebook', description: null, quantity: 1, value: null, isTreasured: true },
          { name: 'Torch', description: null, quantity: 2, value: 3, isTreasured: false },
          {
            name: 'Revolver rounds',
            description: null,
            quantity: 24,
            value: null,
            isTreasured: false,
          },
        ],
        now: NOW,
        executor: tx,
      }),
    )

    const sheet = await loadSheet(investigatorId)
    expect(sheet.possessions.map((item) => item.name)).toEqual([
      'Notebook',
      'Torch',
      'Revolver rounds',
    ])
    expect(sheet.possessions[0]?.isTreasured).toBe(true)
    expect(sheet.possessions[1]?.quantity).toBe(2)
  })

  it('replaces the whole list rather than adding to it', async () => {
    const owner = await createUserRow({ status: 'ACTIVE' })
    const investigatorId = await createDraft(owner.id)

    await db.transaction((tx) =>
      replaceWeapons({
        investigatorId,
        expectedVersion: 0,
        entries: [
          {
            name: 'Walking stick',
            skillKey: 'fighting-brawl',
            damage: '1D6',
            range: null,
            attacks: '1',
            ammunition: null,
            malfunction: null,
            notes: null,
          },
        ],
        now: NOW,
        executor: tx,
      }),
    )

    await db.transaction((tx) =>
      replaceWeapons({
        investigatorId,
        expectedVersion: 1,
        entries: [
          {
            name: 'Service revolver',
            skillKey: 'firearms-handgun',
            damage: '1D10',
            range: '15 yards',
            attacks: '1',
            ammunition: 6,
            malfunction: 100,
            notes: null,
          },
        ],
        now: NOW,
        executor: tx,
      }),
    )

    const sheet = await loadSheet(investigatorId)
    expect(sheet.weapons).toHaveLength(1)
    expect(sheet.weapons[0]?.name).toBe('Service revolver')
    expect(sheet.weapons[0]?.ammunition).toBe(6)
  })
})

import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db/client'
import { investigator, investigatorLineage, investigatorProfile } from '@/db/schema'
import { newId } from '@/lib/ids'
import {
  clearSkillMark,
  listPendingDevelopment,
  listSkills,
  markSkillForDevelopment,
  reconcileOccupationSkills,
  recordDevelopment,
  removeSkill,
  saveSkillAllocation,
} from '@/modules/investigators/data/skills'
import { createUserRow, truncateAll } from './helpers/fixtures'

/**
 * Skill rows under a changing occupation.
 *
 * The interesting behaviour is what survives. Changing careers is normal during
 * creation, and a character who loses their personal-interest points every time
 * they reconsider is a character nobody finishes.
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

  return investigatorId
}

const BASE_VALUES: Record<string, number> = {
  accounting: 5,
  law: 5,
  'library-use': 20,
  listen: 20,
  persuade: 10,
  'spot-hidden': 25,
  occult: 5,
  stealth: 20,
  'science:biology': 1,
}

const baseValueOf = (skillKey: string) => BASE_VALUES[skillKey] ?? 0

beforeEach(async () => {
  await truncateAll()
})

describe('reconcileOccupationSkills', () => {
  it('adds the occupation’s skills at their base value', async () => {
    const owner = await createUserRow({ status: 'ACTIVE' })
    const investigatorId = await createDraft(owner.id)

    const outcome = await db.transaction((tx) =>
      reconcileOccupationSkills({
        investigatorId,
        occupationSkillKeys: ['accounting', 'law', 'library-use'],
        baseValueOf,
        now: NOW,
        executor: tx,
      }),
    )

    expect(outcome.added).toBe(3)
    const skills = await listSkills(investigatorId)
    expect(skills).toHaveLength(3)
    expect(skills.every((skill) => skill.isOccupationSkill)).toBe(true)
    expect(skills.find((skill) => skill.skillKey === 'library-use')?.baseValue).toBe(20)
    expect(skills.find((skill) => skill.skillKey === 'library-use')?.currentValue).toBe(20)
  })

  it('stores a specialization as its family and its choice', async () => {
    const owner = await createUserRow({ status: 'ACTIVE' })
    const investigatorId = await createDraft(owner.id)

    await db.transaction((tx) =>
      reconcileOccupationSkills({
        investigatorId,
        occupationSkillKeys: ['science:biology'],
        baseValueOf,
        now: NOW,
        executor: tx,
      }),
    )

    const [skill] = await listSkills(investigatorId)
    expect(skill?.definitionId).toBe('science')
    expect(skill?.specializationKey).toBe('biology')
    expect(skill?.familyId).toBe('science')
    expect(skill?.skillKey).toBe('science:biology')
  })

  /*
   * Changing occupation is the case that decides whether somebody can experiment
   * while writing a character. Occupation points go, because they belonged to the
   * job; personal interest stays, because it never did.
   */
  it('keeps personal interest when a skill stops being an occupation skill', async () => {
    const owner = await createUserRow({ status: 'ACTIVE' })
    const investigatorId = await createDraft(owner.id)

    await db.transaction((tx) =>
      reconcileOccupationSkills({
        investigatorId,
        occupationSkillKeys: ['accounting', 'law'],
        baseValueOf,
        now: NOW,
        executor: tx,
      }),
    )

    await db.transaction((tx) =>
      saveSkillAllocation({
        investigatorId,
        allocations: [
          {
            skillKey: 'accounting',
            baseValue: 5,
            occupationPoints: 40,
            personalInterestPoints: 10,
          },
          { skillKey: 'law', baseValue: 5, occupationPoints: 20, personalInterestPoints: 0 },
        ],
        now: NOW,
        executor: tx,
      }),
    )

    const outcome = await db.transaction((tx) =>
      reconcileOccupationSkills({
        investigatorId,
        occupationSkillKeys: ['occult', 'law'],
        baseValueOf,
        now: NOW,
        executor: tx,
      }),
    )

    expect(outcome.demoted).toBe(1)
    expect(outcome.added).toBe(1)

    const skills = await listSkills(investigatorId)
    const accounting = skills.find((skill) => skill.skillKey === 'accounting')
    const law = skills.find((skill) => skill.skillKey === 'law')

    expect(accounting?.isOccupationSkill).toBe(false)
    expect(accounting?.occupationPoints).toBe(0)
    expect(accounting?.personalInterestPoints).toBe(10)
    expect(law?.isOccupationSkill).toBe(true)
    expect(law?.occupationPoints).toBe(20)
  })

  it('promotes a skill the character already had', async () => {
    const owner = await createUserRow({ status: 'ACTIVE' })
    const investigatorId = await createDraft(owner.id)

    await db.transaction((tx) =>
      saveSkillAllocation({
        investigatorId,
        allocations: [
          { skillKey: 'occult', baseValue: 5, occupationPoints: 0, personalInterestPoints: 15 },
        ],
        now: NOW,
        executor: tx,
      }),
    )

    const outcome = await db.transaction((tx) =>
      reconcileOccupationSkills({
        investigatorId,
        occupationSkillKeys: ['occult'],
        baseValueOf,
        now: NOW,
        executor: tx,
      }),
    )

    expect(outcome.added).toBe(0)
    const [skill] = await listSkills(investigatorId)
    expect(skill?.isOccupationSkill).toBe(true)
    expect(skill?.personalInterestPoints).toBe(15)
  })
})

describe('saveSkillAllocation', () => {
  it('leaves rows the caller did not mention alone', async () => {
    const owner = await createUserRow({ status: 'ACTIVE' })
    const investigatorId = await createDraft(owner.id)

    await db.transaction((tx) =>
      saveSkillAllocation({
        investigatorId,
        allocations: [
          { skillKey: 'occult', baseValue: 5, occupationPoints: 0, personalInterestPoints: 15 },
          { skillKey: 'stealth', baseValue: 20, occupationPoints: 0, personalInterestPoints: 5 },
        ],
        now: NOW,
        executor: tx,
      }),
    )

    await db.transaction((tx) =>
      saveSkillAllocation({
        investigatorId,
        allocations: [
          { skillKey: 'occult', baseValue: 5, occupationPoints: 0, personalInterestPoints: 20 },
        ],
        now: NOW,
        executor: tx,
      }),
    )

    const skills = await listSkills(investigatorId)
    expect(skills.find((skill) => skill.skillKey === 'occult')?.personalInterestPoints).toBe(20)
    expect(skills.find((skill) => skill.skillKey === 'stealth')?.personalInterestPoints).toBe(5)
  })

  it('totals the current value from every source', async () => {
    const owner = await createUserRow({ status: 'ACTIVE' })
    const investigatorId = await createDraft(owner.id)

    await db.transaction((tx) =>
      saveSkillAllocation({
        investigatorId,
        allocations: [
          {
            skillKey: 'library-use',
            baseValue: 20,
            occupationPoints: 40,
            personalInterestPoints: 5,
          },
        ],
        now: NOW,
        executor: tx,
      }),
    )

    const [skill] = await listSkills(investigatorId)
    expect(skill?.currentValue).toBe(65)
  })
})

describe('removeSkill', () => {
  it('refuses to remove a skill the occupation grants', async () => {
    const owner = await createUserRow({ status: 'ACTIVE' })
    const investigatorId = await createDraft(owner.id)

    await db.transaction((tx) =>
      reconcileOccupationSkills({
        investigatorId,
        occupationSkillKeys: ['accounting'],
        baseValueOf,
        now: NOW,
        executor: tx,
      }),
    )

    const removed = await db.transaction((tx) =>
      removeSkill({ investigatorId, skillKey: 'accounting', now: NOW, executor: tx }),
    )

    expect(removed).toBe(false)
    expect(await listSkills(investigatorId)).toHaveLength(1)
  })

  it('removes one the character chose for themselves', async () => {
    const owner = await createUserRow({ status: 'ACTIVE' })
    const investigatorId = await createDraft(owner.id)

    await db.transaction((tx) =>
      saveSkillAllocation({
        investigatorId,
        allocations: [
          { skillKey: 'occult', baseValue: 5, occupationPoints: 0, personalInterestPoints: 15 },
        ],
        now: NOW,
        executor: tx,
      }),
    )

    const removed = await db.transaction((tx) =>
      removeSkill({ investigatorId, skillKey: 'occult', now: NOW, executor: tx }),
    )

    expect(removed).toBe(true)
    expect(await listSkills(investigatorId)).toHaveLength(0)
  })
})

/**
 * Development marks.
 *
 * The rule that shapes the storage: however many times a skill is ticked before
 * a development phase, it earns one roll. Everything here is about that
 * collapsing correctly and about a spent tick never being spent twice.
 */
describe('development marks', () => {
  async function markedSkill(ownerId: string) {
    const investigatorId = await createDraft(ownerId)
    await db.transaction((tx) =>
      saveSkillAllocation({
        investigatorId,
        allocations: [
          {
            skillKey: 'library-use',
            baseValue: 20,
            occupationPoints: 40,
            personalInterestPoints: 0,
          },
        ],
        now: NOW,
        executor: tx,
      }),
    )

    const [skill] = await listSkills(investigatorId)
    return { investigatorId, skillId: skill!.id }
  }

  it('collapses repeated ticks into one pending development', async () => {
    const owner = await createUserRow({ status: 'ACTIVE' })
    const { investigatorId, skillId } = await markedSkill(owner.id)

    for (const sessionId of [null, null]) {
      await db.transaction((tx) =>
        markSkillForDevelopment({
          investigatorSkillId: skillId,
          gameSessionId: sessionId,
          markedBy: owner.id,
          now: NOW,
          executor: tx,
        }),
      )
    }

    const pending = await listPendingDevelopment(investigatorId)
    expect(pending).toHaveLength(1)
    expect(pending[0]?.currentValue).toBe(60)
  })

  it('clears a tick somebody did not mean', async () => {
    const owner = await createUserRow({ status: 'ACTIVE' })
    const { investigatorId, skillId } = await markedSkill(owner.id)

    await db.transaction((tx) =>
      markSkillForDevelopment({
        investigatorSkillId: skillId,
        gameSessionId: null,
        markedBy: owner.id,
        now: NOW,
        executor: tx,
      }),
    )
    await db.transaction((tx) =>
      clearSkillMark({ investigatorSkillId: skillId, gameSessionId: null, executor: tx }),
    )

    expect(await listPendingDevelopment(investigatorId)).toHaveLength(0)
  })

  /*
   * Resolving ties the marks to the development that spent them, so the same
   * tick cannot earn a second roll at the next chapter's end.
   */
  it('spends the ticks it resolved and raises the skill', async () => {
    const owner = await createUserRow({ status: 'ACTIVE' })
    const { investigatorId, skillId } = await markedSkill(owner.id)

    await db.transaction((tx) =>
      markSkillForDevelopment({
        investigatorSkillId: skillId,
        gameSessionId: null,
        markedBy: owner.id,
        now: NOW,
        executor: tx,
      }),
    )

    await db.transaction((tx) =>
      recordDevelopment({
        investigatorSkillId: skillId,
        percentileRoll: 71,
        improvementRoll: 7,
        previousValue: 60,
        currentValue: 67,
        resolvedBy: owner.id,
        now: NOW,
        executor: tx,
      }),
    )

    expect(await listPendingDevelopment(investigatorId)).toHaveLength(0)

    const [skill] = await listSkills(investigatorId)
    expect(skill?.currentValue).toBe(67)
    expect(skill?.playImprovement).toBe(7)
  })

  it('leaves the skill alone when the roll failed', async () => {
    const owner = await createUserRow({ status: 'ACTIVE' })
    const { investigatorId, skillId } = await markedSkill(owner.id)

    await db.transaction((tx) =>
      markSkillForDevelopment({
        investigatorSkillId: skillId,
        gameSessionId: null,
        markedBy: owner.id,
        now: NOW,
        executor: tx,
      }),
    )

    await db.transaction((tx) =>
      recordDevelopment({
        investigatorSkillId: skillId,
        percentileRoll: 40,
        improvementRoll: null,
        previousValue: 60,
        currentValue: 60,
        resolvedBy: owner.id,
        now: NOW,
        executor: tx,
      }),
    )

    const [skill] = await listSkills(investigatorId)
    expect(skill?.currentValue).toBe(60)
    expect(skill?.playImprovement).toBe(0)
    // The tick is still spent: a failed roll was the roll.
    expect(await listPendingDevelopment(investigatorId)).toHaveLength(0)
  })
})

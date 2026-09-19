import 'server-only'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { type DbOrTx, db } from '@/db/client'
import { investigatorSkill, investigatorSkillDevelopment, investigatorSkillMark } from '@/db/schema'
import { newId } from '@/lib/ids'
import { parseSkillKey, skillKeyOf } from '../domain/occupation-choices'

/**
 * A character's skill rows.
 *
 * Rows rather than columns, so a character can carry as many specializations as
 * they like and the sheet never has to know in advance which ones exist. The key
 * the domain reasons about is reassembled here from the two columns that store
 * it.
 */
export type StoredSkill = {
  readonly id: string
  readonly skillKey: string
  readonly definitionId: string
  readonly specializationKey: string
  readonly specializationLabel: string | null
  readonly familyId: string | null
  readonly baseValue: number
  readonly occupationPoints: number
  readonly personalInterestPoints: number
  readonly playImprovement: number
  readonly otherAdjustment: number
  readonly currentValue: number
  readonly isOccupationSkill: boolean
}

export async function listSkills(
  investigatorId: string,
  executor: DbOrTx = db,
): Promise<StoredSkill[]> {
  const rows = await executor
    .select()
    .from(investigatorSkill)
    .where(eq(investigatorSkill.investigatorId, investigatorId))

  return rows.map((row) => ({
    id: row.id,
    skillKey: skillKeyOf(row.definitionId, row.specializationKey),
    definitionId: row.definitionId,
    specializationKey: row.specializationKey,
    specializationLabel: row.specializationLabel,
    familyId: row.familyId,
    baseValue: row.baseValue,
    occupationPoints: row.occupationPoints,
    personalInterestPoints: row.personalInterestPoints,
    playImprovement: row.playImprovement,
    otherAdjustment: row.otherAdjustment,
    currentValue: row.currentValue,
    isOccupationSkill: row.isOccupationSkill,
  }))
}

/**
 * Brings the skill rows into line with a newly chosen occupation.
 *
 * Three things happen and only one of them loses anything. Skills the occupation
 * grants and the character does not have are added at their base value. Skills
 * that are no longer occupation skills keep their row and their personal
 * interest, but lose the occupation points spent on them - those points belonged
 * to a job the character no longer has. Everything else is untouched.
 */
export async function reconcileOccupationSkills(input: {
  investigatorId: string
  occupationSkillKeys: readonly string[]
  baseValueOf: (skillKey: string) => number | null
  now: Date
  executor: DbOrTx
}): Promise<{ added: number; demoted: number }> {
  const existing = await listSkills(input.investigatorId, input.executor)
  const wanted = new Set(input.occupationSkillKeys)

  const demoted = existing.filter((skill) => skill.isOccupationSkill && !wanted.has(skill.skillKey))
  if (demoted.length > 0) {
    await input.executor
      .update(investigatorSkill)
      .set({ isOccupationSkill: false, occupationPoints: 0, updatedAt: input.now })
      .where(
        inArray(
          investigatorSkill.id,
          demoted.map((skill) => skill.id),
        ),
      )
  }

  const present = new Map(existing.map((skill) => [skill.skillKey, skill]))
  const promoted = [...wanted].filter((key) => present.get(key)?.isOccupationSkill === false)
  if (promoted.length > 0) {
    await input.executor
      .update(investigatorSkill)
      .set({ isOccupationSkill: true, updatedAt: input.now })
      .where(
        inArray(
          investigatorSkill.id,
          promoted.map((key) => present.get(key)!.id),
        ),
      )
  }

  const missing = [...wanted].filter((key) => !present.has(key))
  for (const skillKey of missing) {
    const { definitionId, specializationKey } = parseSkillKey(skillKey)
    const baseValue = input.baseValueOf(skillKey) ?? 0

    await input.executor.insert(investigatorSkill).values({
      id: newId(),
      investigatorId: input.investigatorId,
      definitionId,
      specializationKey,
      familyId: specializationKey === '' ? null : definitionId,
      baseValue,
      currentValue: baseValue,
      isOccupationSkill: true,
      createdAt: input.now,
      updatedAt: input.now,
    })
  }

  return { added: missing.length, demoted: demoted.length }
}

/**
 * Writes an allocation across the character's skills.
 *
 * Rows the caller did not mention are left alone: the sheet saves the skills it
 * showed, and a save that zeroed everything absent would make a filtered list
 * destructive.
 */
export async function saveSkillAllocation(input: {
  investigatorId: string
  allocations: readonly {
    skillKey: string
    occupationPoints: number
    personalInterestPoints: number
    baseValue: number
  }[]
  now: Date
  executor: DbOrTx
}): Promise<void> {
  const existing = await listSkills(input.investigatorId, input.executor)
  const byKey = new Map(existing.map((skill) => [skill.skillKey, skill]))

  for (const allocation of input.allocations) {
    const row = byKey.get(allocation.skillKey)
    const currentValue =
      allocation.baseValue +
      allocation.occupationPoints +
      allocation.personalInterestPoints +
      (row?.playImprovement ?? 0) +
      (row?.otherAdjustment ?? 0)

    if (row) {
      await input.executor
        .update(investigatorSkill)
        .set({
          baseValue: allocation.baseValue,
          occupationPoints: allocation.occupationPoints,
          personalInterestPoints: allocation.personalInterestPoints,
          currentValue,
          updatedAt: input.now,
        })
        .where(eq(investigatorSkill.id, row.id))
      continue
    }

    const { definitionId, specializationKey } = parseSkillKey(allocation.skillKey)
    await input.executor.insert(investigatorSkill).values({
      id: newId(),
      investigatorId: input.investigatorId,
      definitionId,
      specializationKey,
      familyId: specializationKey === '' ? null : definitionId,
      baseValue: allocation.baseValue,
      occupationPoints: allocation.occupationPoints,
      personalInterestPoints: allocation.personalInterestPoints,
      currentValue,
      isOccupationSkill: false,
      createdAt: input.now,
      updatedAt: input.now,
    })
  }
}

/** Removes a skill the character no longer wants, unless it came with the job. */
export async function removeSkill(input: {
  investigatorId: string
  skillKey: string
  now: Date
  executor: DbOrTx
}): Promise<boolean> {
  const { definitionId, specializationKey } = parseSkillKey(input.skillKey)

  const [result] = await input.executor
    .delete(investigatorSkill)
    .where(
      and(
        eq(investigatorSkill.investigatorId, input.investigatorId),
        eq(investigatorSkill.definitionId, definitionId),
        eq(investigatorSkill.specializationKey, specializationKey),
        eq(investigatorSkill.isOccupationSkill, false),
      ),
    )

  return result.affectedRows > 0
}

/**
 * Marks a skill as used successfully in play.
 *
 * However many times a skill is marked before a development phase, it earns one
 * roll: the unique index on skill and session enforces that per session, and the
 * pending query below collapses the rest. The session is kept so the history can
 * say where the tick came from.
 */
export async function markSkillForDevelopment(input: {
  investigatorSkillId: string
  gameSessionId: string | null
  markedBy: string
  now: Date
  executor: DbOrTx
}): Promise<void> {
  await input.executor
    .insert(investigatorSkillMark)
    .values({
      id: newId(),
      investigatorSkillId: input.investigatorSkillId,
      gameSessionId: input.gameSessionId,
      markedBy: input.markedBy,
      markedAt: input.now,
    })
    .onDuplicateKeyUpdate({ set: { markedAt: input.now } })
}

/** Removes an unresolved mark, for a tick somebody did not mean. */
export async function clearSkillMark(input: {
  investigatorSkillId: string
  gameSessionId: string | null
  executor: DbOrTx
}): Promise<void> {
  await input.executor
    .delete(investigatorSkillMark)
    .where(
      and(
        eq(investigatorSkillMark.investigatorSkillId, input.investigatorSkillId),
        isNull(investigatorSkillMark.developmentId),
        input.gameSessionId === null
          ? isNull(investigatorSkillMark.gameSessionId)
          : eq(investigatorSkillMark.gameSessionId, input.gameSessionId),
      ),
    )
}

/**
 * Resolves one ticked skill and ties the marks that earned it to the result.
 *
 * The development row is the record of a roll somebody made; the marks point at
 * it afterwards so a tick is never spent twice, and the history keeps which
 * sessions earned it. The skill's own value moves in the same transaction.
 */
export async function recordDevelopment(input: {
  investigatorSkillId: string
  percentileRoll: number
  improvementRoll: number | null
  previousValue: number
  currentValue: number
  resolvedBy: string
  now: Date
  executor: DbOrTx
}): Promise<string> {
  const developmentId = newId()

  await input.executor.insert(investigatorSkillDevelopment).values({
    id: developmentId,
    investigatorSkillId: input.investigatorSkillId,
    resolvedBy: input.resolvedBy,
    percentileRoll: input.percentileRoll,
    improvementRoll: input.improvementRoll,
    previousValue: input.previousValue,
    currentValue: input.currentValue,
    resolvedAt: input.now,
  })

  await input.executor
    .update(investigatorSkillMark)
    .set({ developmentId })
    .where(
      and(
        eq(investigatorSkillMark.investigatorSkillId, input.investigatorSkillId),
        isNull(investigatorSkillMark.developmentId),
      ),
    )

  if (input.currentValue !== input.previousValue) {
    await input.executor
      .update(investigatorSkill)
      .set({
        playImprovement: sql`${investigatorSkill.playImprovement} + ${input.currentValue - input.previousValue}`,
        currentValue: input.currentValue,
        updatedAt: input.now,
      })
      .where(eq(investigatorSkill.id, input.investigatorSkillId))
  }

  return developmentId
}

/** Every skill carrying an unresolved tick, with what it would be rolled against. */
export async function listPendingDevelopment(
  investigatorId: string,
  executor: DbOrTx = db,
): Promise<{ investigatorSkillId: string; skillKey: string; currentValue: number }[]> {
  const rows = await executor
    .selectDistinct({
      investigatorSkillId: investigatorSkill.id,
      definitionId: investigatorSkill.definitionId,
      specializationKey: investigatorSkill.specializationKey,
      currentValue: investigatorSkill.currentValue,
    })
    .from(investigatorSkillMark)
    .innerJoin(
      investigatorSkill,
      eq(investigatorSkill.id, investigatorSkillMark.investigatorSkillId),
    )
    .where(
      and(
        eq(investigatorSkill.investigatorId, investigatorId),
        isNull(investigatorSkillMark.developmentId),
      ),
    )

  return rows.map((row) => ({
    investigatorSkillId: row.investigatorSkillId,
    skillKey: skillKeyOf(row.definitionId, row.specializationKey),
    currentValue: row.currentValue,
  }))
}

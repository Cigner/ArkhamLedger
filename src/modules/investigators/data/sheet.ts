import 'server-only'
import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { type DbOrTx, db } from '@/db/client'
import {
  investigator,
  investigatorBackstoryEntry,
  investigatorCharacteristic,
  investigatorDerivedOverride,
  investigatorFieldVisibility,
  investigatorFinance,
  investigatorPossession,
  investigatorProfile,
  investigatorSkill,
  investigatorSkillMark,
  investigatorState,
  investigatorWeapon,
} from '@/db/schema'
import { NotFoundError } from '@/lib/errors'
import { newId } from '@/lib/ids'
import {
  calculateDamageBonusAndBuild,
  calculateHitPoints,
  calculateMagicPoints,
  calculateMaximumSanity,
  calculateMovementRate,
  calculateSuccessThresholds,
} from '../domain/derived-values'
import { MAXIMUM_LUCK } from '../domain/constants'
import type { BackstoryCategory } from '../domain/constants'
import type {
  InvestigatorSheet,
  SheetBackstoryEntry,
  SheetOverride,
  SheetResource,
  SheetSkill,
} from '../domain/sheet'
import type { FieldVisibility } from '../domain/visibility'

/**
 * The whole sheet, in one read.
 *
 * Nine tables and the rules engine produce one value. Assembling it here rather
 * than per screen is what lets the same thing serve the live sheet, a snapshot,
 * a disclosure and an export - four readers that must agree about what a
 * character is, or history stops matching the present.
 *
 * Calculated values are computed rather than stored. A stored maximum drifts the
 * first time a characteristic is corrected, and a sheet whose numbers disagree
 * with its own characteristics is worse than one that takes a moment longer to
 * load.
 *
 * Unguarded: callers authorize first, and the projection for a particular reader
 * happens afterwards in projectSheet.
 */
const EMPTY_RESOURCE: SheetResource = { current: null, maximum: null }

function resource(current: number | null, maximum: number | null): SheetResource {
  return current === null && maximum === null ? EMPTY_RESOURCE : { current, maximum }
}

export async function loadSheet(
  investigatorId: string,
  executor: DbOrTx = db,
): Promise<InvestigatorSheet> {
  const core = await executor
    .select()
    .from(investigator)
    .where(eq(investigator.id, investigatorId))
    .limit(1)
    .then((rows) => rows[0])

  if (!core) throw new NotFoundError()

  const [profile, characteristics, state, finance, skills, backstory, weapons, possessions] =
    await Promise.all([
      executor
        .select()
        .from(investigatorProfile)
        .where(eq(investigatorProfile.investigatorId, investigatorId))
        .limit(1)
        .then((rows) => rows[0]),
      executor
        .select()
        .from(investigatorCharacteristic)
        .where(eq(investigatorCharacteristic.investigatorId, investigatorId))
        .limit(1)
        .then((rows) => rows[0]),
      executor
        .select()
        .from(investigatorState)
        .where(eq(investigatorState.investigatorId, investigatorId))
        .limit(1)
        .then((rows) => rows[0]),
      executor
        .select()
        .from(investigatorFinance)
        .where(eq(investigatorFinance.investigatorId, investigatorId))
        .limit(1)
        .then((rows) => rows[0]),
      executor
        .select()
        .from(investigatorSkill)
        .where(eq(investigatorSkill.investigatorId, investigatorId))
        .orderBy(asc(investigatorSkill.definitionId), asc(investigatorSkill.specializationKey)),
      executor
        .select()
        .from(investigatorBackstoryEntry)
        .where(eq(investigatorBackstoryEntry.investigatorId, investigatorId))
        .orderBy(
          asc(investigatorBackstoryEntry.category),
          asc(investigatorBackstoryEntry.position),
        ),
      executor
        .select()
        .from(investigatorWeapon)
        .where(eq(investigatorWeapon.investigatorId, investigatorId))
        .orderBy(asc(investigatorWeapon.position)),
      executor
        .select()
        .from(investigatorPossession)
        .where(eq(investigatorPossession.investigatorId, investigatorId))
        .orderBy(asc(investigatorPossession.position)),
    ])

  const [pendingMarks, overrides] = await Promise.all([
    loadPendingMarks(
      skills.map((skill) => skill.id),
      executor,
    ),
    loadDerivedOverrides(investigatorId, executor),
  ])

  const overridden = new Map(overrides.map((override) => [override.fieldKey, override.value]))
  const settled = (fieldKey: string, calculated: number | null): number | null =>
    overridden.get(fieldKey) ?? calculated

  const mythos = skills.find((skill) => skill.definitionId === 'cthulhu-mythos')?.currentValue ?? 0

  /*
   * Credit Rating is a skill, and the money is read out of it. The finance row
   * keeps a column for it so an import can carry one, but the skill wins: two
   * places holding the same number is two places that can disagree, and the one
   * people actually change is the skill.
   */
  const creditRating =
    skills.find((skill) => skill.definitionId === 'credit-rating')?.currentValue ??
    finance?.creditRating ??
    null

  return {
    id: core.id,
    lineageId: core.lineageId,
    ownerId: core.ownerId,
    status: core.status,
    creationMethod: core.creationMethod,
    rulesetId: core.rulesetId,
    rulesetVersion: core.rulesetVersion,
    era: core.era,
    firstUsedAt: core.firstUsedAt,
    lockVersion: core.lockVersion,

    identity: {
      name: profile?.name ?? null,
      age: profile?.age ?? null,
      sex: profile?.sex ?? null,
      residence: profile?.residence ?? null,
      birthplace: profile?.birthplace ?? null,
      species: profile?.species ?? 'Human',
      occupationId: profile?.occupationId ?? null,
      occupationCharacteristic: (profile?.occupationCharacteristic ??
        null) as InvestigatorSheet['identity']['occupationCharacteristic'],
      occupationContact: profile?.occupationContact ?? null,
    },

    characteristics: {
      STR: characteristics?.strength ?? null,
      CON: characteristics?.constitution ?? null,
      SIZ: characteristics?.size ?? null,
      DEX: characteristics?.dexterity ?? null,
      APP: characteristics?.appearance ?? null,
      INT: characteristics?.intelligence ?? null,
      POW: characteristics?.power ?? null,
      EDU: characteristics?.education ?? null,
    },

    /*
     * Current Luck falls back to the rolled starting value. Until a character
     * has been played there is nothing to have spent, and a creator whose Luck
     * field emptied itself on save would look like it had lost the number.
     */
    luck: resource(state?.luck ?? characteristics?.startingLuck ?? null, MAXIMUM_LUCK),
    hitPoints: resource(
      state?.hitPoints ?? null,
      settled(
        'derived.hitPoints',
        characteristics?.constitution != null && characteristics.size != null
          ? calculateHitPoints({
              constitution: characteristics.constitution,
              size: characteristics.size,
            })
          : null,
      ),
    ),
    sanity: resource(
      state?.sanity ?? null,
      settled('derived.sanity', calculateMaximumSanity(mythos)),
    ),
    magicPoints: resource(
      state?.magicPoints ?? null,
      settled(
        'derived.magicPoints',
        characteristics?.power != null ? calculateMagicPoints(characteristics.power) : null,
      ),
    ),

    movementRate: settled(
      'derived.movementRate',
      characteristics?.strength != null &&
        characteristics.dexterity != null &&
        characteristics.size != null &&
        profile?.age != null
        ? calculateMovementRate({
            strength: characteristics.strength,
            dexterity: characteristics.dexterity,
            size: characteristics.size,
            age: profile.age,
          })
        : null,
    ),
    damageBonus:
      characteristics?.strength != null && characteristics.size != null
        ? calculateDamageBonusAndBuild(characteristics.strength + characteristics.size).damageBonus
        : null,
    build: settled(
      'derived.build',
      characteristics?.strength != null && characteristics.size != null
        ? calculateDamageBonusAndBuild(characteristics.strength + characteristics.size).build
        : null,
    ),

    conditions: {
      majorWound: state?.majorWound ?? false,
      temporaryInsanity: state?.temporaryInsanity ?? false,
      indefiniteInsanity: state?.indefiniteInsanity ?? false,
      unconscious: state?.unconscious ?? false,
      dying: state?.dying ?? false,
    },

    finances: {
      creditRating,
      cash: finance?.cash ?? null,
      assets: finance?.assets ?? null,
      spendingLevel: finance?.spendingLevel ?? null,
    },

    skills: skills.map((skill): SheetSkill => ({
      definitionId: skill.definitionId,
      specializationKey: skill.specializationKey,
      specializationLabel: skill.specializationLabel,
      baseValue: skill.baseValue,
      occupationPoints: skill.occupationPoints,
      personalInterestPoints: skill.personalInterestPoints,
      playImprovement: skill.playImprovement,
      otherAdjustment: skill.otherAdjustment,
      currentValue: skill.currentValue,
      isOccupationSkill: skill.isOccupationSkill,
      thresholds: calculateSuccessThresholds(skill.currentValue),
      hasDevelopmentMark: pendingMarks.has(skill.id),
    })),

    backstory: backstory.map((entry): SheetBackstoryEntry => ({
      category: entry.category as BackstoryCategory,
      content: entry.content,
      position: entry.position,
      isKeyConnection: entry.isKeyConnection,
    })),

    weapons: weapons.map((weapon) => ({
      name: weapon.name,
      skillKey: weapon.skillKey,
      damage: weapon.damage,
      range: weapon.range,
      attacks: weapon.attacks,
      ammunition: weapon.ammunition,
      malfunction: weapon.malfunction,
      notes: weapon.notes,
    })),

    possessions: possessions.map((possession) => ({
      name: possession.name,
      description: possession.description,
      quantity: possession.quantity,
      value: possession.value,
      isTreasured: possession.isTreasured,
    })),

    overrides,
  }
}

/**
 * Calculated values somebody has replaced by hand.
 *
 * Only the ones still in force. An override that has been withdrawn stays in the
 * table as history rather than being deleted, so the sheet can show that a
 * number was once insisted upon and by whom.
 *
 * A value that will not parse as a number is ignored rather than crashing the
 * sheet. The column is text because the eventual set includes values that are
 * not numbers, and a sheet that fails to load is a worse answer than one that
 * shows the calculated value.
 */
async function loadDerivedOverrides(
  investigatorId: string,
  executor: DbOrTx,
): Promise<SheetOverride[]> {
  const rows = await executor
    .select({
      fieldKey: investigatorDerivedOverride.fieldKey,
      value: investigatorDerivedOverride.value,
      reason: investigatorDerivedOverride.reason,
    })
    .from(investigatorDerivedOverride)
    .where(
      and(
        eq(investigatorDerivedOverride.investigatorId, investigatorId),
        isNull(investigatorDerivedOverride.endedAt),
      ),
    )

  return rows.flatMap((row) => {
    const value = Number.parseInt(row.value, 10)
    return Number.isFinite(value) ? [{ fieldKey: row.fieldKey, value, reason: row.reason }] : []
  })
}

/**
 * Which skills are carrying an unresolved development mark.
 *
 * A mark is pending until a development roll resolves it. Repeated marks before
 * resolution are one pending mark, not several, so the sheet shows the tick a
 * player is used to seeing rather than a count of how often it was earned.
 */
async function loadPendingMarks(
  skillIds: readonly string[],
  executor: DbOrTx,
): Promise<ReadonlySet<string>> {
  if (skillIds.length === 0) return new Set()

  const rows = await executor
    .select({ investigatorSkillId: investigatorSkillMark.investigatorSkillId })
    .from(investigatorSkillMark)
    .where(
      and(
        inArray(investigatorSkillMark.investigatorSkillId, [...skillIds]),
        isNull(investigatorSkillMark.developmentId),
      ),
    )

  return new Set(rows.map((row) => row.investigatorSkillId))
}

/** The owner's explicit privacy decisions; everything absent stays public. */
export async function loadFieldVisibility(
  investigatorId: string,
  executor: DbOrTx = db,
): Promise<[string, FieldVisibility][]> {
  const rows = await executor
    .select({
      fieldKey: investigatorFieldVisibility.fieldKey,
      visibility: investigatorFieldVisibility.visibility,
    })
    .from(investigatorFieldVisibility)
    .where(eq(investigatorFieldVisibility.investigatorId, investigatorId))

  return rows.map((row) => [row.fieldKey, row.visibility])
}

/**
 * Replaces a calculated value by hand, or withdraws the replacement.
 *
 * Overrides are a history rather than a setting: the open one is closed and a
 * new row written, so "this was 12 because Eleanor said so in March" survives
 * somebody changing it in June. Withdrawing closes the open row and writes
 * nothing, which returns the sheet to what the rules compute.
 */
export async function setDerivedOverride(input: {
  investigatorId: string
  fieldKey: string
  value: number | null
  reason: string
  setBy: string
  now: Date
  executor: DbOrTx
}): Promise<void> {
  await input.executor
    .update(investigatorDerivedOverride)
    .set({ endedAt: input.now, updatedAt: input.now })
    .where(
      and(
        eq(investigatorDerivedOverride.investigatorId, input.investigatorId),
        eq(investigatorDerivedOverride.fieldKey, input.fieldKey),
        isNull(investigatorDerivedOverride.endedAt),
      ),
    )

  if (input.value === null) return

  await input.executor.insert(investigatorDerivedOverride).values({
    id: newId(),
    investigatorId: input.investigatorId,
    fieldKey: input.fieldKey,
    value: String(input.value),
    reason: input.reason,
    setBy: input.setBy,
    createdAt: input.now,
    updatedAt: input.now,
  })
}

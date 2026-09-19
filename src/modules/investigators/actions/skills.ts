'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { investigatorProfile } from '@/db/schema'
import { recordAudit } from '@/lib/audit'
import { ConflictError, DomainRuleError } from '@/lib/errors'
import { authActionClient } from '@/lib/safe-action'
import { sanitizeUserText } from '@/lib/text/sanitize'
import {
  baseValueForSkillKey,
  resolveOccupationSkills,
  skillKeyOf,
} from '../domain/occupation-choices'
import {
  calculateOccupationSkillPoints,
  calculatePersonalInterestPoints,
} from '../domain/occupations'
import { requireRuleset } from '../domain/rulesets'
import {
  addSkillSchema,
  removeSkillSchema,
  saveOccupationSchema,
  saveSkillsSchema,
} from '../domain/schemas'
import { validateSkillPointAllocation } from '../domain/skill-allocation'
import type { CharacteristicKey } from '../domain/types'
import { requireInvestigatorAccess } from '../data/guards'
import { claimVersion, findInvestigatorState } from '../data/investigator-store'
import { loadSheet } from '../data/sheet'
import {
  listSkills,
  reconcileOccupationSkills,
  removeSkill,
  saveSkillAllocation,
} from '../data/skills'

/**
 * Occupation and skills.
 *
 * These two are one decision split across two sections: an occupation is a
 * budget and a list of skills it may be spent on, and the skills section is that
 * budget being spent. Choosing the occupation is therefore what creates the
 * skill rows, which is also what the `isOccupationSkill` flag is for.
 *
 * Both validate against the ruleset the character is pinned to rather than the
 * current one. A character created before a package was revised keeps the
 * budgets it was made with.
 */
function characteristicsOf(sheet: {
  characteristics: Partial<Record<CharacteristicKey, number | null>>
}): Record<CharacteristicKey, number> | null {
  const keys: CharacteristicKey[] = ['STR', 'CON', 'SIZ', 'DEX', 'APP', 'INT', 'POW', 'EDU']
  const values: Partial<Record<CharacteristicKey, number>> = {}

  for (const key of keys) {
    const value = sheet.characteristics[key]
    if (value === null || value === undefined) return null
    values[key] = value
  }

  return values as Record<CharacteristicKey, number>
}

export const saveOccupation = authActionClient
  .metadata({ name: 'investigator.saveOccupation' })
  .inputSchema(saveOccupationSchema)
  .action(async ({ parsedInput, ctx }) => {
    await requireInvestigatorAccess(parsedInput.investigatorId, 'EDIT_SHEET')
    const state = await findInvestigatorState(parsedInput.investigatorId)
    const ruleset = requireRuleset(state.rulesetId, state.rulesetVersion)

    const occupation = ruleset.occupations.occupations.find(
      (entry) => entry.id === parsedInput.occupationId,
    )
    if (!occupation) throw new DomainRuleError('investigators.errors.unknownOccupation')

    const sheet = await loadSheet(parsedInput.investigatorId)
    const characteristics = characteristicsOf(sheet)
    if (!characteristics) {
      throw new DomainRuleError('investigators.errors.characteristicsRequiredFirst')
    }

    /*
     * The point formula is evaluated now rather than at activation, because it
     * is the one thing about an occupation somebody needs to see before they
     * commit to it.
     */
    const budget = calculateOccupationSkillPoints(
      occupation.pointFormula,
      characteristics,
      parsedInput.characteristic ?? undefined,
    )
    if (!budget.ok) throw new DomainRuleError(budget.error.key, budget.error.params)

    const resolved = resolveOccupationSkills({
      occupation,
      catalog: ruleset.occupations,
      chosen: parsedInput.choices,
    })
    if (!resolved.ok) throw new DomainRuleError(resolved.error.key, resolved.error.params)

    const now = new Date()

    const outcome = await db.transaction(async (tx) => {
      const claimed = await claimVersion({
        investigatorId: parsedInput.investigatorId,
        expectedVersion: parsedInput.expectedVersion,
        now,
        executor: tx,
      })
      if (!claimed) throw new ConflictError('investigators.errors.sheetMovedOn')

      await tx
        .update(investigatorProfile)
        .set({
          occupationId: occupation.id,
          occupationCharacteristic: parsedInput.characteristic ?? null,
          occupationContact: parsedInput.contact?.trim() || null,
          updatedAt: now,
        })
        .where(eq(investigatorProfile.investigatorId, parsedInput.investigatorId))

      const reconciled = await reconcileOccupationSkills({
        investigatorId: parsedInput.investigatorId,
        occupationSkillKeys: resolved.value,
        baseValueOf: (skillKey) =>
          baseValueForSkillKey({ skillKey, catalog: ruleset.skills, characteristics }),
        now,
        executor: tx,
      })

      await recordAudit(
        {
          actorId: ctx.user.id,
          action: 'investigator.occupationChosen',
          entityType: 'investigator',
          entityId: parsedInput.investigatorId,
          metadata: { occupation: occupation.id, demoted: reconciled.demoted },
        },
        tx,
      )

      return reconciled
    })

    revalidatePath(`/investigators/${parsedInput.investigatorId}`)

    return {
      ok: true,
      version: parsedInput.expectedVersion + 1,
      occupationPoints: budget.value,
      personalInterestPoints: calculatePersonalInterestPoints(characteristics.INT),
      pointsLostFromPreviousOccupation: outcome.demoted,
    }
  })

export const saveSkills = authActionClient
  .metadata({ name: 'investigator.saveSkills' })
  .inputSchema(saveSkillsSchema)
  .action(async ({ parsedInput }) => {
    await requireInvestigatorAccess(parsedInput.investigatorId, 'EDIT_SHEET')
    const state = await findInvestigatorState(parsedInput.investigatorId)
    const ruleset = requireRuleset(state.rulesetId, state.rulesetVersion)

    const sheet = await loadSheet(parsedInput.investigatorId)
    const characteristics = characteristicsOf(sheet)
    if (!characteristics) {
      throw new DomainRuleError('investigators.errors.characteristicsRequiredFirst')
    }

    const occupationId = sheet.identity.occupationId
    const occupation = ruleset.occupations.occupations.find((entry) => entry.id === occupationId)
    if (!occupation) throw new DomainRuleError('investigators.errors.occupationRequired')

    /*
     * The characteristic the player chose when they took the occupation. Passing
     * nothing here would make every occupation with a choice compute a budget of
     * zero, and the sheet would refuse every allocation against it.
     */
    const budget = calculateOccupationSkillPoints(
      occupation.pointFormula,
      characteristics,
      sheet.identity.occupationCharacteristic ?? undefined,
    )
    if (!budget.ok) throw new DomainRuleError(budget.error.key, budget.error.params)

    const stored = await listSkills(parsedInput.investigatorId)
    const occupationSkillKeys = stored
      .filter((skill) => skill.isOccupationSkill)
      .map((skill) => skill.skillKey)

    const allocations = parsedInput.allocations.map((allocation) => ({
      skillKey: allocation.skillKey,
      baseValue:
        baseValueForSkillKey({
          skillKey: allocation.skillKey,
          catalog: ruleset.skills,
          characteristics,
        }) ?? 0,
      occupationPoints: allocation.occupationPoints,
      personalInterestPoints: allocation.personalInterestPoints,
      otherAdjustment:
        stored.find((skill) => skill.skillKey === allocation.skillKey)?.otherAdjustment ?? 0,
    }))

    const validated = validateSkillPointAllocation({
      occupationBudget: budget.value,
      personalInterestBudget: calculatePersonalInterestPoints(characteristics.INT),
      occupationSkillKeys,
      creditRating: occupation.creditRating,
      allocations,
    })
    if (!validated.ok) throw new DomainRuleError(validated.error.key, validated.error.params)

    const now = new Date()

    await db.transaction(async (tx) => {
      const claimed = await claimVersion({
        investigatorId: parsedInput.investigatorId,
        expectedVersion: parsedInput.expectedVersion,
        now,
        executor: tx,
      })
      if (!claimed) throw new ConflictError('investigators.errors.sheetMovedOn')

      await saveSkillAllocation({
        investigatorId: parsedInput.investigatorId,
        allocations,
        now,
        executor: tx,
      })
    })

    revalidatePath(`/investigators/${parsedInput.investigatorId}`)

    return { ok: true, version: parsedInput.expectedVersion + 1, summary: validated.value }
  })

export const removeInvestigatorSkill = authActionClient
  .metadata({ name: 'investigator.removeSkill' })
  .inputSchema(removeSkillSchema)
  .action(async ({ parsedInput }) => {
    await requireInvestigatorAccess(parsedInput.investigatorId, 'EDIT_SHEET')

    const now = new Date()
    const removed = await db.transaction((tx) =>
      removeSkill({
        investigatorId: parsedInput.investigatorId,
        skillKey: parsedInput.skillKey,
        now,
        executor: tx,
      }),
    )

    if (!removed) throw new DomainRuleError('investigators.errors.occupationSkillCannotBeRemoved')

    revalidatePath(`/investigators/${parsedInput.investigatorId}`)

    return { ok: true }
  })

/**
 * Adds a skill the occupation did not give them.
 *
 * Personal interest points go anywhere, so the sheet has to be able to show a
 * skill nobody's job required. Family skills need the specialization written in,
 * because "Science" is not something a character has.
 *
 * The row starts at its base value with nothing allocated: adding a skill is
 * saying it exists on this sheet, and spending on it is the next decision.
 */
export const addInvestigatorSkill = authActionClient
  .metadata({ name: 'investigator.addSkill' })
  .inputSchema(addSkillSchema)
  .action(async ({ parsedInput }) => {
    await requireInvestigatorAccess(parsedInput.investigatorId, 'EDIT_SHEET')
    const state = await findInvestigatorState(parsedInput.investigatorId)
    const ruleset = requireRuleset(state.rulesetId, state.rulesetVersion)

    const isSkill = ruleset.skills.skills.some((skill) => skill.id === parsedInput.definitionId)
    const family = ruleset.skills.families.find((entry) => entry.id === parsedInput.definitionId)
    if (!isSkill && !family) throw new DomainRuleError('investigators.errors.unknownSkill')

    const specialization = parsedInput.specialization
      ? sanitizeUserText(parsedInput.specialization, { maxLength: 100 })
      : ''
    if (family && specialization.length === 0) {
      throw new DomainRuleError('investigators.errors.specializationRequired')
    }

    const sheet = await loadSheet(parsedInput.investigatorId)
    const characteristics = characteristicsOf(sheet)
    if (!characteristics) {
      throw new DomainRuleError('investigators.errors.characteristicsRequiredFirst')
    }

    const skillKey = skillKeyOf(parsedInput.definitionId, specialization || null)
    const existing = await listSkills(parsedInput.investigatorId)
    if (existing.some((skill) => skill.skillKey === skillKey)) {
      throw new DomainRuleError('investigators.errors.skillAlreadyOnSheet')
    }

    const now = new Date()

    await db.transaction(async (tx) => {
      const claimed = await claimVersion({
        investigatorId: parsedInput.investigatorId,
        expectedVersion: parsedInput.expectedVersion,
        now,
        executor: tx,
      })
      if (!claimed) throw new ConflictError('investigators.errors.sheetMovedOn')

      await saveSkillAllocation({
        investigatorId: parsedInput.investigatorId,
        allocations: [
          {
            skillKey,
            baseValue:
              baseValueForSkillKey({ skillKey, catalog: ruleset.skills, characteristics }) ?? 0,
            occupationPoints: 0,
            personalInterestPoints: 0,
          },
        ],
        now,
        executor: tx,
      })
    })

    revalidatePath(`/investigators/${parsedInput.investigatorId}`)

    return { ok: true, version: parsedInput.expectedVersion + 1, skillKey }
  })

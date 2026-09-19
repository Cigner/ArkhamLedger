'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/db/client'
import { recordAudit } from '@/lib/audit'
import { ConflictError, DomainRuleError } from '@/lib/errors'
import { authActionClient } from '@/lib/safe-action'
import { sanitizeOptionalText } from '@/lib/text/sanitize'
import { type Conditions, adjustResource, applyDamage, applySanityLoss } from '../domain/resources'
import { resolveDevelopment } from '../domain/development'
import {
  adjustResourceSchema,
  markSkillForDevelopmentSchema,
  resolveDevelopmentSchema,
  reverseResourceChangeSchema,
  setConditionsSchema,
} from '../domain/schemas'
import { findLiveSessionStart } from '../data/campaign-bindings'
import { requireInvestigatorAccess } from '../data/guards'
import {
  applyResourceChange,
  findReversibleEvent,
  sanityLostSince,
  setConditions,
} from '../data/resources'
import { loadSheet } from '../data/sheet'
import {
  clearSkillMark,
  listPendingDevelopment,
  listSkills,
  markSkillForDevelopment,
  recordDevelopment,
} from '../data/skills'

/**
 * Running a character during play.
 *
 * Nothing here claims a version. The sheet's optimistic lock protects its
 * content - the things somebody writes and rewrites - while these are events in
 * time: two people recording damage during a fight are recording two blows, not
 * competing to describe one. Serialising them would lose the second.
 *
 * Damage and Sanity loss go through the rules rather than through subtraction,
 * so the sheet applies what the table would have applied and reports the rolls
 * the rules call for instead of deciding them.
 */
/**
 * When the character's current in-game day began.
 *
 * The rules leave this to the Keeper and say it usually lasts until the
 * investigators find somewhere safe to rest, which in this application is the
 * session they are in. Calendar midnight is the one answer that is definitely
 * wrong: a game played from eight in the evening crosses UTC midnight partway
 * through, and the one-fifth threshold would reset in the middle of the night
 * it exists to measure.
 *
 * Outside a session there is nothing to anchor to, so it falls back to the last
 * twenty-four hours - a rolling window rather than a line the clock crosses.
 */
const ONE_DAY_MS = 24 * 60 * 60 * 1000

async function currentDayStarted(input: { investigatorId: string; now: Date }): Promise<Date> {
  const live = await findLiveSessionStart({ investigatorId: input.investigatorId })
  return live ?? new Date(input.now.getTime() - ONE_DAY_MS)
}

export const adjustInvestigatorResource = authActionClient
  .metadata({ name: 'investigator.adjustResource' })
  .inputSchema(adjustResourceSchema)
  .action(async ({ parsedInput, ctx }) => {
    await requireInvestigatorAccess(parsedInput.investigatorId, 'EDIT_SHEET')
    const sheet = await loadSheet(parsedInput.investigatorId)

    if (sheet.status !== 'ACTIVE') {
      throw new DomainRuleError('investigators.errors.notInPlay')
    }

    const now = new Date()
    const reason = sanitizeOptionalText(parsedInput.reason, { maxLength: 500 })
    const conditions: Conditions = sheet.conditions

    const outcome = await resolve({
      sheet,
      resource: parsedInput.resource,
      amount: parsedInput.amount,
      conditions,
      investigatorId: parsedInput.investigatorId,
      now,
    })

    await db.transaction(async (tx) => {
      await applyResourceChange({
        investigatorId: parsedInput.investigatorId,
        resource: parsedInput.resource,
        previousValue: outcome.previousValue,
        currentValue: outcome.currentValue,
        conditions: outcome.conditions,
        actorId: ctx.user.id,
        reason,
        gameSessionId: parsedInput.gameSessionId ?? null,
        now,
        executor: tx,
      })
    })

    revalidatePath(`/investigators/${parsedInput.investigatorId}`)

    return {
      ok: true,
      value: outcome.currentValue,
      constitutionRollRequired: outcome.constitutionRollRequired,
      intelligenceRollRequired: outcome.intelligenceRollRequired,
      majorWound: outcome.majorWoundInflicted,
      killedOutright: outcome.killedOutright,
      indefiniteInsanity: outcome.indefiniteInsanity,
    }
  })

async function resolve(input: {
  sheet: Awaited<ReturnType<typeof loadSheet>>
  resource: 'HP' | 'SAN' | 'MP' | 'LUCK'
  amount: number
  conditions: Conditions
  investigatorId: string
  now: Date
}) {
  const { sheet, amount } = input

  if (input.resource === 'HP' && amount < 0) {
    const previousValue = sheet.hitPoints.current ?? 0
    const outcome = applyDamage({
      damage: -amount,
      hitPoints: previousValue,
      maximumHitPoints: sheet.hitPoints.maximum ?? previousValue,
      conditions: input.conditions,
      status: sheet.status,
    })

    return {
      previousValue,
      currentValue: outcome.hitPoints,
      conditions: outcome.conditions,
      constitutionRollRequired: outcome.constitutionRollRequired,
      intelligenceRollRequired: false,
      majorWoundInflicted: outcome.majorWoundInflicted,
      killedOutright: outcome.killedOutright,
      indefiniteInsanity: false,
    }
  }

  if (input.resource === 'SAN' && amount < 0) {
    const previousValue = sheet.sanity.current ?? 0
    const today = await sanityLostSince({
      investigatorId: input.investigatorId,
      since: await currentDayStarted({
        investigatorId: input.investigatorId,
        now: input.now,
      }),
    })

    const outcome = applySanityLoss({
      loss: -amount,
      sanity: previousValue,
      conditions: input.conditions,
      sanityAtStartOfDay: today.sanityAtStart ?? previousValue,
      lostToday: today.lost,
    })

    return {
      previousValue,
      currentValue: outcome.sanity,
      conditions: outcome.conditions,
      constitutionRollRequired: false,
      intelligenceRollRequired: outcome.intelligenceRollRequired,
      majorWoundInflicted: false,
      killedOutright: false,
      indefiniteInsanity: outcome.indefiniteInsanityThresholdReached,
    }
  }

  const resource = {
    HP: sheet.hitPoints,
    SAN: sheet.sanity,
    MP: sheet.magicPoints,
    LUCK: sheet.luck,
  }[input.resource]

  const previousValue = resource.current ?? 0

  return {
    previousValue,
    currentValue: adjustResource({
      current: previousValue,
      delta: amount,
      maximum: resource.maximum,
    }),
    conditions: input.conditions,
    constitutionRollRequired: false,
    intelligenceRollRequired: false,
    majorWoundInflicted: false,
    killedOutright: false,
    indefiniteInsanity: false,
  }
}

/**
 * Undoes the last change.
 *
 * Written as a new event pointing at the one it reverses rather than by deleting
 * anything: the journal is append-only, and "that was a mistake" is itself a
 * fact about the evening worth keeping.
 */
export const reverseResourceChange = authActionClient
  .metadata({ name: 'investigator.reverseResource' })
  .inputSchema(reverseResourceChangeSchema)
  .action(async ({ parsedInput, ctx }) => {
    await requireInvestigatorAccess(parsedInput.investigatorId, 'EDIT_SHEET')

    const event = await findReversibleEvent({ investigatorId: parsedInput.investigatorId })
    if (!event) throw new ConflictError('investigators.errors.nothingToUndo')

    const now = new Date()

    await db.transaction(async (tx) => {
      await applyResourceChange({
        investigatorId: parsedInput.investigatorId,
        resource: event.resource,
        previousValue: event.currentValue,
        currentValue: event.previousValue,
        actorId: ctx.user.id,
        reason: null,
        reversesEventId: event.id,
        now,
        executor: tx,
      })
    })

    revalidatePath(`/investigators/${parsedInput.investigatorId}`)

    return { ok: true, resource: event.resource, value: event.previousValue }
  })

/**
 * Sets the health and insanity boxes by hand.
 *
 * The rules put several of these behind a roll the table makes, so the sheet
 * has to accept being told the answer. It sets flags and moves no numbers.
 */
export const setInvestigatorConditions = authActionClient
  .metadata({ name: 'investigator.setConditions' })
  .inputSchema(setConditionsSchema)
  .action(async ({ parsedInput, ctx }) => {
    await requireInvestigatorAccess(parsedInput.investigatorId, 'EDIT_SHEET')

    const sheet = await loadSheet(parsedInput.investigatorId)
    const now = new Date()

    const conditions = {
      majorWound: parsedInput.majorWound,
      temporaryInsanity: parsedInput.temporaryInsanity,
      indefiniteInsanity: parsedInput.indefiniteInsanity,
      unconscious: parsedInput.unconscious,
      dying: parsedInput.dying,
    }

    const changed = (Object.keys(conditions) as (keyof typeof conditions)[]).filter(
      (key) => conditions[key] !== sheet.conditions[key],
    )

    await db.transaction(async (tx) => {
      await setConditions({
        investigatorId: parsedInput.investigatorId,
        conditions,
        now,
        executor: tx,
      })

      /*
       * Resources carry their own journal; conditions did not, and whether
       * somebody is dying is not a flag that should move without a record. It is
       * audited rather than journalled because nothing here is a number, and a
       * resource event with no delta would be a lie in the shape of one.
       */
      if (changed.length > 0) {
        await recordAudit(
          {
            actorId: ctx.user.id,
            action: 'investigator.conditionsChanged',
            entityType: 'investigator',
            entityId: parsedInput.investigatorId,
            metadata: {
              changed: changed.join(','),
              dying: conditions.dying,
              unconscious: conditions.unconscious,
            },
          },
          tx,
        )
      }
    })

    revalidatePath(`/investigators/${parsedInput.investigatorId}`)

    return { ok: true }
  })

/**
 * Ticks a skill that was used successfully.
 *
 * Done during play, by whoever is holding the sheet. However many times a skill
 * is ticked before the development phase it earns one roll, so ticking twice is
 * harmless rather than generous.
 */
export const markSkill = authActionClient
  .metadata({ name: 'investigator.markSkill' })
  .inputSchema(markSkillForDevelopmentSchema)
  .action(async ({ parsedInput, ctx }) => {
    await requireInvestigatorAccess(parsedInput.investigatorId, 'EDIT_SHEET')

    const skills = await listSkills(parsedInput.investigatorId)
    const skill = skills.find((entry) => entry.skillKey === parsedInput.skillKey)
    if (!skill) throw new DomainRuleError('investigators.errors.unknownSkill')

    const now = new Date()

    await db.transaction(async (tx) => {
      if (parsedInput.marked) {
        await markSkillForDevelopment({
          investigatorSkillId: skill.id,
          gameSessionId: parsedInput.gameSessionId ?? null,
          markedBy: ctx.user.id,
          now,
          executor: tx,
        })
        return
      }

      await clearSkillMark({
        investigatorSkillId: skill.id,
        gameSessionId: parsedInput.gameSessionId ?? null,
        executor: tx,
      })
    })

    revalidatePath(`/investigators/${parsedInput.investigatorId}`)

    return { ok: true, marked: parsedInput.marked }
  })

/**
 * The development phase, one skill at a time.
 *
 * Both dice are entered rather than rolled. Keeping it per skill rather than as
 * one batch mirrors how it is done at the table - a roll, a result, the next
 * skill - and means a mistyped die costs one entry instead of the evening.
 */
export const resolveSkillDevelopment = authActionClient
  .metadata({ name: 'investigator.resolveDevelopment' })
  .inputSchema(resolveDevelopmentSchema)
  .action(async ({ parsedInput, ctx }) => {
    await requireInvestigatorAccess(parsedInput.investigatorId, 'EDIT_SHEET')

    const pending = await listPendingDevelopment(parsedInput.investigatorId)
    const skill = pending.find((entry) => entry.skillKey === parsedInput.skillKey)
    if (!skill) throw new DomainRuleError('investigators.errors.skillNotMarked')

    const outcome = resolveDevelopment({
      currentValue: skill.currentValue,
      percentileRoll: parsedInput.percentileRoll,
      ...(parsedInput.improvementRoll === null || parsedInput.improvementRoll === undefined
        ? {}
        : { improvementRoll: parsedInput.improvementRoll }),
    })
    if (!outcome.ok) throw new DomainRuleError(outcome.error.key, outcome.error.params)

    const now = new Date()

    await db.transaction((tx) =>
      recordDevelopment({
        investigatorSkillId: skill.investigatorSkillId,
        percentileRoll: parsedInput.percentileRoll,
        improvementRoll: parsedInput.improvementRoll ?? null,
        previousValue: outcome.value.previous,
        currentValue: outcome.value.current,
        resolvedBy: ctx.user.id,
        now,
        executor: tx,
      }),
    )

    revalidatePath(`/investigators/${parsedInput.investigatorId}`)

    return {
      ok: true,
      improved: outcome.value.improved,
      increase: outcome.value.increase,
      current: outcome.value.current,
      basis: outcome.value.basis,
    }
  })

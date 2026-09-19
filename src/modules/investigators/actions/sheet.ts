'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/db/client'
import { recordAudit } from '@/lib/audit'
import { ConflictError, DomainRuleError } from '@/lib/errors'
import { authActionClient } from '@/lib/safe-action'
import { sanitizeOptionalText, sanitizeUserText } from '@/lib/text/sanitize'
import { BACKSTORY_CATEGORIES } from '../domain/constants'
import type { BackstoryCategory } from '../domain/constants'
import { calculateStartingFinances } from '../domain/finances'
import { transitionInvestigator } from '../domain/lifecycle'
import { reviewDraft, validateAge } from '../domain/creation'
import {
  calculateHitPoints,
  calculateMagicPoints,
  calculateStartingSanity,
} from '../domain/derived-values'
import {
  activateInvestigatorSchema,
  saveBackstorySchema,
  saveCharacteristicsSchema,
  saveFinancesSchema,
  saveIdentitySchema,
  savePossessionsSchema,
  saveWeaponsSchema,
  setDerivedOverrideSchema,
} from '../domain/schemas'
import { requireInvestigatorAccess } from '../data/guards'
import {
  claimVersion,
  findInvestigatorState,
  replaceBackstory,
  replacePossessions,
  replaceWeapons,
  saveCharacteristics,
  saveFinances,
  saveProfile,
  seedStartingResources,
  setInvestigatorStatus,
} from '../data/investigator-store'
import { loadSheet, setDerivedOverride } from '../data/sheet'

/**
 * Writing the sheet.
 *
 * Each section saves on its own and carries the version it was read at. Two
 * people editing one character is the ordinary case here - the owner at the
 * table and the Keeper who started the sheet for them - so a save that finds the
 * version has moved refuses and says so, rather than overwriting work it never
 * saw.
 *
 * Nothing refuses an incomplete section. A character being written is
 * incomplete by definition, and validation is what the review panel is for.
 */
export const saveIdentity = authActionClient
  .metadata({ name: 'investigator.saveIdentity' })
  .inputSchema(saveIdentitySchema)
  .action(async ({ parsedInput }) => {
    await requireInvestigatorAccess(parsedInput.investigatorId, 'EDIT_SHEET')

    const name = sanitizeUserText(parsedInput.name, { maxLength: 160 })
    if (name.length === 0) throw new DomainRuleError('investigators.errors.nameRequired')

    if (parsedInput.age !== null) {
      const age = validateAge(parsedInput.age)
      if (!age.ok) throw new DomainRuleError(age.error.key, age.error.params)
    }

    const now = new Date()

    await db.transaction(async (tx) => {
      const saved = await saveProfile({
        investigatorId: parsedInput.investigatorId,
        expectedVersion: parsedInput.expectedVersion,
        values: {
          name,
          age: parsedInput.age,
          sex: sanitizeOptionalText(parsedInput.sex, { maxLength: 80 }),
          residence: sanitizeOptionalText(parsedInput.residence, { maxLength: 200 }),
          birthplace: sanitizeOptionalText(parsedInput.birthplace, { maxLength: 200 }),
          species: sanitizeUserText(parsedInput.species, { maxLength: 80 }) || 'Human',
        },
        now,
        executor: tx,
      })

      if (!saved) throw new ConflictError('investigators.errors.sheetMovedOn')
    })

    revalidatePath(`/investigators/${parsedInput.investigatorId}`)

    return { ok: true, version: parsedInput.expectedVersion + 1 }
  })

/**
 * Replacing a calculated value by hand.
 *
 * Section 8: a manual override requires a reason, is clearly marked, and
 * appears in history. The reason is mandatory in both directions, because
 * withdrawing one is also a decision somebody made - and the projection hides
 * an override along with the field it replaces, so a reason can never describe
 * a number its reader may not see.
 */
export const setInvestigatorOverride = authActionClient
  .metadata({ name: 'investigator.setOverride' })
  .inputSchema(setDerivedOverrideSchema)
  .action(async ({ parsedInput, ctx }) => {
    await requireInvestigatorAccess(parsedInput.investigatorId, 'EDIT_SHEET')

    const reason = sanitizeUserText(parsedInput.reason, { maxLength: 500 })
    if (reason.length === 0) throw new DomainRuleError('investigators.errors.reasonRequired')

    const now = new Date()

    await db.transaction(async (tx) => {
      const claimed = await claimVersion({
        investigatorId: parsedInput.investigatorId,
        expectedVersion: parsedInput.expectedVersion,
        now,
        executor: tx,
      })
      if (!claimed) throw new ConflictError('investigators.errors.sheetMovedOn')

      await setDerivedOverride({
        investigatorId: parsedInput.investigatorId,
        fieldKey: parsedInput.fieldKey,
        value: parsedInput.value,
        reason,
        setBy: ctx.user.id,
        now,
        executor: tx,
      })

      await recordAudit(
        {
          actorId: ctx.user.id,
          action: 'investigator.overrideSet',
          entityType: 'investigator',
          entityId: parsedInput.investigatorId,
          metadata: { fieldKey: parsedInput.fieldKey, value: parsedInput.value, reason },
        },
        tx,
      )
    })

    revalidatePath(`/investigators/${parsedInput.investigatorId}`)

    return { ok: true, version: parsedInput.expectedVersion + 1 }
  })

export const saveInvestigatorCharacteristics = authActionClient
  .metadata({ name: 'investigator.saveCharacteristics' })
  .inputSchema(saveCharacteristicsSchema)
  .action(async ({ parsedInput }) => {
    await requireInvestigatorAccess(parsedInput.investigatorId, 'EDIT_SHEET')

    const now = new Date()

    await db.transaction(async (tx) => {
      const saved = await saveCharacteristics({
        investigatorId: parsedInput.investigatorId,
        expectedVersion: parsedInput.expectedVersion,
        values: {
          strength: parsedInput.STR,
          constitution: parsedInput.CON,
          size: parsedInput.SIZ,
          dexterity: parsedInput.DEX,
          appearance: parsedInput.APP,
          intelligence: parsedInput.INT,
          power: parsedInput.POW,
          education: parsedInput.EDU,
          startingLuck: parsedInput.startingLuck,
        },
        rollRecord: { source: parsedInput.source, recordedAt: now.toISOString() },
        now,
        executor: tx,
      })

      if (!saved) throw new ConflictError('investigators.errors.sheetMovedOn')
    })

    revalidatePath(`/investigators/${parsedInput.investigatorId}`)

    return { ok: true, version: parsedInput.expectedVersion + 1 }
  })

/**
 * Turns a finished draft into a character.
 *
 * The moment the resources start: hit points, Sanity and magic points are seeded
 * from the characteristics, because a character who walks into their first
 * session already wounded is a bug rather than a story.
 */
export const activateInvestigator = authActionClient
  .metadata({ name: 'investigator.activate' })
  .inputSchema(activateInvestigatorSchema)
  .action(async ({ parsedInput, ctx }) => {
    await requireInvestigatorAccess(parsedInput.investigatorId, 'EDIT_SHEET')
    const state = await findInvestigatorState(parsedInput.investigatorId)

    const transition = transitionInvestigator(state.status, 'ACTIVE')
    if (!transition.ok) throw new DomainRuleError(transition.error.key, transition.error.params)

    const sheet = await loadSheet(parsedInput.investigatorId)

    const review = reviewDraft({
      name: sheet.identity.name,
      age: sheet.identity.age,
      characteristics: sheet.characteristics,
      startingLuck: sheet.luck.current,
      occupationId: sheet.identity.occupationId,
    })

    const [firstError] = review.errors
    if (firstError) throw new DomainRuleError(firstError.key, firstError.params)

    const now = new Date()

    await db.transaction(async (tx) => {
      const moved = await setInvestigatorStatus({
        investigatorId: parsedInput.investigatorId,
        expectedVersion: parsedInput.expectedVersion,
        status: 'ACTIVE',
        now,
        executor: tx,
      })
      if (!moved) throw new ConflictError('investigators.errors.sheetMovedOn')

      const constitution = sheet.characteristics.CON ?? 0
      const size = sheet.characteristics.SIZ ?? 0
      const power = sheet.characteristics.POW ?? 0

      /*
       * The maxima come off the sheet rather than from the formulas, so a value
       * somebody replaced by hand before activation is the value the character
       * starts with. Sanity is the exception: its maximum is what Cthulhu
       * Mythos leaves of ninety-nine, while a character starts at POW.
       */
      await seedStartingResources({
        investigatorId: parsedInput.investigatorId,
        values: {
          hitPoints: sheet.hitPoints.maximum ?? calculateHitPoints({ constitution, size }),
          sanity: calculateStartingSanity(power),
          magicPoints: sheet.magicPoints.maximum ?? calculateMagicPoints(power),
          luck: sheet.luck.current ?? 0,
        },
        now,
        executor: tx,
      })

      await recordAudit(
        {
          actorId: ctx.user.id,
          action: 'investigator.activated',
          entityType: 'investigator',
          entityId: parsedInput.investigatorId,
          metadata: { ruleset: sheet.rulesetId },
        },
        tx,
      )
    })

    revalidatePath(`/investigators/${parsedInput.investigatorId}`)

    return { ok: true }
  })

/**
 * Saves the money.
 *
 * Only what play changes. The living standard and the spending level are read
 * out of Credit Rating every time the sheet loads, so there is nothing here to
 * keep in step with them.
 */
export const saveInvestigatorFinances = authActionClient
  .metadata({ name: 'investigator.saveFinances' })
  .inputSchema(saveFinancesSchema)
  .action(async ({ parsedInput }) => {
    await requireInvestigatorAccess(parsedInput.investigatorId, 'EDIT_SHEET')
    const sheet = await loadSheet(parsedInput.investigatorId)

    const starting =
      sheet.finances.creditRating === null
        ? null
        : calculateStartingFinances(
            sheet.era === 'MODERN' ? 'MODERN' : 'CLASSIC_1920S',
            sheet.finances.creditRating,
          )

    const now = new Date()

    await db.transaction(async (tx) => {
      const saved = await saveFinances({
        investigatorId: parsedInput.investigatorId,
        expectedVersion: parsedInput.expectedVersion,
        values: {
          cash: parsedInput.cash,
          assets: parsedInput.assets,
          spendingLevel: starting?.ok ? starting.value.spendingLevel : null,
          assetsUnboundedAbove: starting?.ok ? starting.value.assetsUnboundedAbove : false,
          notes: sanitizeOptionalText(parsedInput.notes, {
            maxLength: 2000,
            allowLineBreaks: true,
          }),
        },
        now,
        executor: tx,
      })

      if (!saved) throw new ConflictError('investigators.errors.sheetMovedOn')
    })

    revalidatePath(`/investigators/${parsedInput.investigatorId}`)

    return { ok: true, version: parsedInput.expectedVersion + 1 }
  })

/**
 * Saves the ten boxes of backstory.
 *
 * Empty boxes are dropped rather than stored as empty rows, so "what has this
 * character told us about themselves" is answerable by counting.
 */
export const saveInvestigatorBackstory = authActionClient
  .metadata({ name: 'investigator.saveBackstory' })
  .inputSchema(saveBackstorySchema)
  .action(async ({ parsedInput }) => {
    await requireInvestigatorAccess(parsedInput.investigatorId, 'EDIT_SHEET')

    const entries = parsedInput.entries.flatMap((entry, index) => {
      if (!BACKSTORY_CATEGORIES.includes(entry.category as BackstoryCategory)) return []
      const content = sanitizeUserText(entry.content, { maxLength: 4000, allowLineBreaks: true })
      if (content.length === 0) return []
      return [
        {
          category: entry.category,
          content,
          position: index,
          isKeyConnection: entry.isKeyConnection,
        },
      ]
    })

    const now = new Date()

    await db.transaction(async (tx) => {
      const saved = await replaceBackstory({
        investigatorId: parsedInput.investigatorId,
        expectedVersion: parsedInput.expectedVersion,
        entries,
        now,
        executor: tx,
      })

      if (!saved) throw new ConflictError('investigators.errors.sheetMovedOn')
    })

    revalidatePath(`/investigators/${parsedInput.investigatorId}`)

    return { ok: true, version: parsedInput.expectedVersion + 1 }
  })

export const saveInvestigatorPossessions = authActionClient
  .metadata({ name: 'investigator.savePossessions' })
  .inputSchema(savePossessionsSchema)
  .action(async ({ parsedInput }) => {
    await requireInvestigatorAccess(parsedInput.investigatorId, 'EDIT_SHEET')

    const entries = parsedInput.entries.flatMap((entry) => {
      const name = sanitizeUserText(entry.name, { maxLength: 200 })
      if (name.length === 0) return []
      return [
        {
          name,
          description: sanitizeOptionalText(entry.description, {
            maxLength: 1000,
            allowLineBreaks: true,
          }),
          quantity: entry.quantity,
          value: entry.value,
          isTreasured: entry.isTreasured,
        },
      ]
    })

    const now = new Date()

    await db.transaction(async (tx) => {
      const saved = await replacePossessions({
        investigatorId: parsedInput.investigatorId,
        expectedVersion: parsedInput.expectedVersion,
        entries,
        now,
        executor: tx,
      })
      if (!saved) throw new ConflictError('investigators.errors.sheetMovedOn')
    })

    revalidatePath(`/investigators/${parsedInput.investigatorId}`)

    return { ok: true, version: parsedInput.expectedVersion + 1 }
  })

export const saveInvestigatorWeapons = authActionClient
  .metadata({ name: 'investigator.saveWeapons' })
  .inputSchema(saveWeaponsSchema)
  .action(async ({ parsedInput }) => {
    await requireInvestigatorAccess(parsedInput.investigatorId, 'EDIT_SHEET')

    const entries = parsedInput.entries.flatMap((entry) => {
      const name = sanitizeUserText(entry.name, { maxLength: 160 })
      const damage = sanitizeUserText(entry.damage, { maxLength: 80 })
      if (name.length === 0 || damage.length === 0) return []
      return [
        {
          name,
          skillKey: entry.skillKey,
          damage,
          range: sanitizeOptionalText(entry.range, { maxLength: 80 }),
          attacks: sanitizeOptionalText(entry.attacks, { maxLength: 80 }),
          ammunition: entry.ammunition,
          malfunction: entry.malfunction,
          notes: sanitizeOptionalText(entry.notes, { maxLength: 1000, allowLineBreaks: true }),
        },
      ]
    })

    const now = new Date()

    await db.transaction(async (tx) => {
      const saved = await replaceWeapons({
        investigatorId: parsedInput.investigatorId,
        expectedVersion: parsedInput.expectedVersion,
        entries,
        now,
        executor: tx,
      })
      if (!saved) throw new ConflictError('investigators.errors.sheetMovedOn')
    })

    revalidatePath(`/investigators/${parsedInput.investigatorId}`)

    return { ok: true, version: parsedInput.expectedVersion + 1 }
  })

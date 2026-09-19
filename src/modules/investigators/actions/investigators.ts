'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { investigatorProfile } from '@/db/schema'
import { recordAudit } from '@/lib/audit'
import { DomainRuleError } from '@/lib/errors'
import { authActionClient } from '@/lib/safe-action'
import { sanitizeUserText } from '@/lib/text/sanitize'
import { requireCampaignMember, requireKeeper } from '@/modules/campaigns/data/guards'
import { announceToUser } from '@/modules/notifications/data/announce'
import { canLinkToCampaign } from '../domain/binding'
import { investigatorImportSchema, reviewImport } from '../domain/import'
import { DEFAULT_RULESET_ID, DEFAULT_RULESET_VERSION, requireRuleset } from '../domain/rulesets'
import {
  campaignBindingSchema,
  createForPlayerSchema,
  createInvestigatorSchema,
  duplicateInvestigatorSchema,
  importInvestigatorSchema,
  unlinkInvestigatorSchema,
} from '../domain/schemas'
import {
  findActiveBinding,
  linkInvestigator,
  listCampaignPlayers,
  listCampaignsToRequestFor,
} from '../data/campaign-bindings'
import { branchInvestigator } from '../data/branching'
import { openEditGrant } from '../data/grants'
import { requireInvestigatorAccess } from '../data/guards'
import { applyImportedSheet } from '../data/import'
import { findInvestigatorState, insertInvestigator } from '../data/investigator-store'
import { unlinkFromCampaign } from '../data/snapshots'

/**
 * Creating and placing characters.
 *
 * Two ways in, and the difference is who ends up holding the pen. A player
 * makes their own character and owns it outright. A Keeper makes one for
 * somebody who has not arrived yet, and it is that person's from the moment it
 * exists - the Keeper keeps a temporary right to finish it, which expires the
 * first time it is played.
 *
 * Nothing here lets a Keeper reach a player's other characters. Every campaign
 * operation names a character that is already in that campaign, or one the
 * Keeper is creating for it.
 */
export const createInvestigator = authActionClient
  .metadata({ name: 'investigator.create' })
  .inputSchema(createInvestigatorSchema)
  .action(async ({ parsedInput, ctx }) => {
    const ruleset = requireRuleset(parsedInput.rulesetId, parsedInput.rulesetVersion)
    const name = sanitizeUserText(parsedInput.name, { maxLength: 160 })
    if (name.length === 0) throw new DomainRuleError('investigators.errors.nameRequired')

    if (parsedInput.campaignId) await requireCampaignMember(parsedInput.campaignId)

    const now = new Date()

    const created = await db.transaction(async (tx) => {
      const investigator = await insertInvestigator({
        ownerId: ctx.user.id,
        creatorId: ctx.user.id,
        creatorCampaignId: parsedInput.campaignId ?? null,
        name,
        creationMethod: parsedInput.creationMethod,
        rulesetId: ruleset.manifest.id,
        rulesetVersion: ruleset.manifest.version,
        era: ruleset.manifest.era,
        now,
        executor: tx,
      })

      if (parsedInput.campaignId) {
        await linkInvestigator({
          investigatorId: investigator.investigatorId,
          campaignId: parsedInput.campaignId,
          linkedBy: ctx.user.id,
          now,
          executor: tx,
        })
      }

      await recordAudit(
        {
          actorId: ctx.user.id,
          action: 'investigator.created',
          entityType: 'investigator',
          entityId: investigator.investigatorId,
          metadata: { ruleset: ruleset.manifest.id, forSelf: true },
        },
        tx,
      )

      return investigator
    })

    if (parsedInput.campaignId) revalidatePath(`/campaigns/${parsedInput.campaignId}/investigators`)
    revalidatePath('/investigators')

    return { investigatorId: created.investigatorId }
  })

/**
 * A Keeper writes a character for one of their players.
 *
 * The player owns it immediately rather than on acceptance. A character waiting
 * to be claimed is a character nobody can edit, and the person it was made for
 * should be able to change their own name and age without asking.
 */
export const createInvestigatorForPlayer = authActionClient
  .metadata({ name: 'investigator.createForPlayer' })
  .inputSchema(createForPlayerSchema)
  .action(async ({ parsedInput, ctx }) => {
    const context = await requireKeeper(parsedInput.campaignId)
    const ruleset = requireRuleset(parsedInput.rulesetId, parsedInput.rulesetVersion)

    const players = await listCampaignPlayers(parsedInput.campaignId)
    const player = players.find((member) => member.userId === parsedInput.playerId)
    if (!player) throw new DomainRuleError('investigators.errors.playerNotInCampaign')

    const name = sanitizeUserText(parsedInput.name, { maxLength: 160 })
    if (name.length === 0) throw new DomainRuleError('investigators.errors.nameRequired')

    const now = new Date()

    const created = await db.transaction(async (tx) => {
      const investigator = await insertInvestigator({
        ownerId: player.userId,
        creatorId: ctx.user.id,
        creatorCampaignId: parsedInput.campaignId,
        name,
        creationMethod: parsedInput.creationMethod,
        rulesetId: ruleset.manifest.id,
        rulesetVersion: ruleset.manifest.version,
        era: ruleset.manifest.era,
        now,
        executor: tx,
      })

      await linkInvestigator({
        investigatorId: investigator.investigatorId,
        campaignId: parsedInput.campaignId,
        linkedBy: ctx.user.id,
        now,
        executor: tx,
      })

      /*
       * The grant is what lets the Keeper finish the sheet they started. It is
       * written here rather than implied by creatorId, so that closing it at
       * first use is a fact in the database and not a rule somebody has to
       * remember to apply.
       */
      await openEditGrant({
        investigatorId: investigator.investigatorId,
        campaignId: parsedInput.campaignId,
        keeperId: ctx.user.id,
        now,
        executor: tx,
      })

      await recordAudit(
        {
          actorId: ctx.user.id,
          action: 'investigator.editGrantOpened',
          entityType: 'investigator',
          entityId: investigator.investigatorId,
          metadata: { campaignId: parsedInput.campaignId, keeperId: ctx.user.id },
        },
        tx,
      )

      await announceToUser({
        userId: player.userId,
        type: 'INVESTIGATOR_CREATED_FOR_YOU',
        campaignId: parsedInput.campaignId,
        payload: {
          actorName: ctx.user.name,
          investigatorName: name,
          investigatorId: investigator.investigatorId,
        },
        now,
        executor: tx,
      })

      await recordAudit(
        {
          actorId: ctx.user.id,
          action: 'investigator.createdForPlayer',
          entityType: 'investigator',
          entityId: investigator.investigatorId,
          metadata: { campaignId: parsedInput.campaignId, ownerId: player.userId },
        },
        tx,
      )

      return investigator
    })

    revalidatePath(`/campaigns/${context.membership.campaignId}/investigators`)

    return { investigatorId: created.investigatorId }
  })

/**
 * Brings one of the caller's own characters into a campaign they play in.
 *
 * Only the owner may do this. A Keeper who wants a particular character asks
 * for it; taking one would mean a campaign could help itself to whatever it
 * could name.
 */
export const linkInvestigatorToCampaign = authActionClient
  .metadata({ name: 'investigator.link' })
  .inputSchema(campaignBindingSchema)
  .action(async ({ parsedInput, ctx }) => {
    await requireInvestigatorAccess(parsedInput.investigatorId, 'CONFIGURE_PRIVACY')
    const membership = await requireCampaignMember(parsedInput.campaignId)
    const investigator = await findInvestigatorState(parsedInput.investigatorId)

    if (investigator.ownerId !== ctx.user.id) {
      throw new DomainRuleError('investigators.errors.notYours')
    }

    const existing = await findActiveBinding({
      investigatorId: parsedInput.investigatorId,
      campaignId: parsedInput.campaignId,
    })

    const allowed = canLinkToCampaign({
      status: investigator.status,
      archivedAt: investigator.archivedAt,
      ownerIsMember: true,
      alreadyLinked: existing !== null,
    })
    if (!allowed.ok) throw new DomainRuleError(allowed.error.key, allowed.error.params)

    const now = new Date()

    await db.transaction(async (tx) => {
      await linkInvestigator({
        investigatorId: parsedInput.investigatorId,
        campaignId: parsedInput.campaignId,
        linkedBy: ctx.user.id,
        now,
        executor: tx,
      })

      const players = await listCampaignPlayers(parsedInput.campaignId, tx)
      for (const keeper of players.filter((member) => member.isKeeper)) {
        await announceToUser({
          userId: keeper.userId,
          type: 'INVESTIGATOR_LINKED',
          campaignId: parsedInput.campaignId,
          payload: {
            actorName: ctx.user.name,
            investigatorId: parsedInput.investigatorId,
          },
          now,
          executor: tx,
        })
      }

      await recordAudit(
        {
          actorId: ctx.user.id,
          action: 'investigator.linked',
          entityType: 'investigator',
          entityId: parsedInput.investigatorId,
          metadata: { campaignId: parsedInput.campaignId },
        },
        tx,
      )
    })

    revalidatePath(`/campaigns/${membership.membership.campaignId}/investigators`)

    return { ok: true }
  })

/**
 * A Keeper asks for a character they have met elsewhere.
 *
 * The counterpart of the rule above. A Keeper cannot bring somebody else's
 * character into their campaign, and this is what they do instead: the owner
 * gets an invitation and links it themselves, or does not. Nothing changes
 * until they act.
 *
 * Both halves are checked where they belong. Seeing the character at all goes
 * through the sheet's own guard, so a Keeper cannot ask for one they have never
 * been shown; the campaign is re-derived from the same query that offered it,
 * so a hand-made request cannot name a campaign the caller does not keep or one
 * the owner cannot reach.
 */
export const requestInvestigatorForCampaign = authActionClient
  .metadata({ name: 'investigator.request' })
  .inputSchema(campaignBindingSchema)
  .action(async ({ parsedInput, ctx }) => {
    await requireInvestigatorAccess(parsedInput.investigatorId, 'VIEW_CURRENT')
    const investigator = await findInvestigatorState(parsedInput.investigatorId)

    const offered = await listCampaignsToRequestFor({
      investigatorId: parsedInput.investigatorId,
      keeperId: ctx.user.id,
      ownerId: investigator.ownerId,
    })

    const target = offered.find((entry) => entry.campaignId === parsedInput.campaignId)
    if (!target) throw new DomainRuleError('investigators.errors.cannotRequest')

    const now = new Date()

    await db.transaction(async (tx) => {
      await announceToUser({
        userId: investigator.ownerId,
        type: 'INVESTIGATOR_REQUESTED',
        campaignId: parsedInput.campaignId,
        payload: {
          actorName: ctx.user.name,
          investigatorId: parsedInput.investigatorId,
        },
        now,
        executor: tx,
      })

      await recordAudit(
        {
          actorId: ctx.user.id,
          action: 'investigator.requested',
          entityType: 'investigator',
          entityId: parsedInput.investigatorId,
          metadata: { campaignId: parsedInput.campaignId },
        },
        tx,
      )
    })

    return { ok: true }
  })

/**
 * Takes a character out of a campaign.
 *
 * Either the owner or a Keeper of that campaign: both have a legitimate reason,
 * and either way everybody who could see the sheet keeps what they were shown.
 * The session history is untouched - this is about what happens next.
 */
export const unlinkInvestigatorFromCampaign = authActionClient
  .metadata({ name: 'investigator.unlink' })
  .inputSchema(unlinkInvestigatorSchema)
  .action(async ({ parsedInput, ctx }) => {
    const membership = await requireCampaignMember(parsedInput.campaignId)
    const investigator = await findInvestigatorState(parsedInput.investigatorId)

    const isOwner = investigator.ownerId === ctx.user.id
    const isKeeper = membership.membership.role === 'KEEPER'
    if (!isOwner && !isKeeper) throw new DomainRuleError('investigators.errors.notAllowed')

    const binding = await findActiveBinding({
      investigatorId: parsedInput.investigatorId,
      campaignId: parsedInput.campaignId,
    })
    if (!binding) throw new DomainRuleError('investigators.errors.notInCampaign')

    const now = new Date()
    const reason = parsedInput.reason
      ? sanitizeUserText(parsedInput.reason, { maxLength: 500 })
      : null

    const disclosed = await db.transaction(async (tx) => {
      const captured = await unlinkFromCampaign({
        investigatorId: parsedInput.investigatorId,
        campaignId: parsedInput.campaignId,
        reason,
        now,
        executor: tx,
      })

      await recordAudit(
        {
          actorId: ctx.user.id,
          action: 'investigator.unlinked',
          entityType: 'investigator',
          entityId: parsedInput.investigatorId,
          metadata: { campaignId: parsedInput.campaignId, disclosures: captured },
        },
        tx,
      )

      return captured
    })

    revalidatePath(`/campaigns/${parsedInput.campaignId}/investigators`)

    return { ok: true, disclosures: disclosed }
  })

/**
 * Copies a character into a variant of its own.
 *
 * A branch of the same lineage rather than a new character, because that is what
 * it is: the same fiction taken in another direction. The copy joins no
 * campaigns - a duplicate turning up in the game the original is being played in
 * would be two of somebody at one table.
 *
 * Its history stays with the original. What the copy inherits is the sheet, not
 * the record of who saw it or what happened to it.
 */
export const duplicateInvestigator = authActionClient
  .metadata({ name: 'investigator.duplicate' })
  .inputSchema(duplicateInvestigatorSchema)
  .action(async ({ parsedInput, ctx }) => {
    const context = await requireInvestigatorAccess(parsedInput.investigatorId, 'VIEW_FULL')
    const source = await findInvestigatorState(parsedInput.investigatorId)

    // A copy belongs to whoever owns the original, whoever asked for it.
    if (source.ownerId !== ctx.user.id && context.role !== 'CREATOR_KEEPER') {
      throw new DomainRuleError('investigators.errors.notYours')
    }

    const now = new Date()

    const branchId = await db.transaction(async (tx) => {
      const id = await branchInvestigator({
        sourceInvestigatorId: parsedInput.investigatorId,
        newOwnerId: source.ownerId,
        createdBy: ctx.user.id,
        now,
        executor: tx,
      })

      if (parsedInput.name) {
        const name = sanitizeUserText(parsedInput.name, { maxLength: 160 })
        if (name.length > 0) {
          await tx
            .update(investigatorProfile)
            .set({ name, updatedAt: now })
            .where(eq(investigatorProfile.investigatorId, id))
        }
      }

      await recordAudit(
        {
          actorId: ctx.user.id,
          action: 'investigator.duplicated',
          entityType: 'investigator',
          entityId: id,
          metadata: { sourceInvestigatorId: parsedInput.investigatorId },
        },
        tx,
      )

      return id
    })

    revalidatePath('/investigators')

    return { ok: true, investigatorId: branchId }
  })

/**
 * Creating a character from a file.
 *
 * It arrives as a draft owned by whoever imported it, whatever the file says
 * about ownership, status or history. A file is somebody's claim about a
 * character, not a character - so what it asserts is read, what the rules can
 * compute is recomputed, and what has to be earned at a table is left at zero.
 *
 * Warnings rather than refusal wherever the file is merely odd: dropping one
 * unrecognised skill is better than refusing a whole sheet over a line somebody
 * typed by hand.
 */
export const importInvestigator = authActionClient
  .metadata({ name: 'investigator.import' })
  .inputSchema(importInvestigatorSchema)
  .action(async ({ parsedInput, ctx }) => {
    let document: unknown
    try {
      document = JSON.parse(parsedInput.document)
    } catch {
      throw new DomainRuleError('investigators.errors.importNotJson')
    }

    const parsed = investigatorImportSchema.safeParse(document)
    if (!parsed.success) throw new DomainRuleError('investigators.errors.importInvalid')

    const ruleset = requireRuleset(DEFAULT_RULESET_ID, DEFAULT_RULESET_VERSION)

    const review = reviewImport({
      parsed: parsed.data,
      knownSkillIds: new Set(ruleset.skills.skills.map((skill) => skill.id)),
      knownFamilyIds: new Set(ruleset.skills.families.map((family) => family.id)),
      knownOccupationIds: new Set(ruleset.occupations.occupations.map((entry) => entry.id)),
      rulesetId: ruleset.manifest.id,
      rulesetVersion: ruleset.manifest.version,
    })
    if (!review.ok) throw new DomainRuleError(review.error.key, review.error.params)

    if (parsedInput.campaignId) await requireCampaignMember(parsedInput.campaignId)

    const sheet = parsed.data.sheet
    const name = sanitizeUserText(sheet.identity.name, { maxLength: 160 })
    if (name.length === 0) throw new DomainRuleError('investigators.errors.nameRequired')

    const now = new Date()

    const created = await db.transaction(async (tx) => {
      const investigator = await insertInvestigator({
        ownerId: ctx.user.id,
        creatorId: ctx.user.id,
        creatorCampaignId: parsedInput.campaignId ?? null,
        name,
        /*
         * Whatever the file claims, an imported character was not rolled here.
         * Manual entry is the honest description and the one the rules already
         * have a word for.
         */
        creationMethod: 'MANUAL_ENTRY',
        rulesetId: ruleset.manifest.id,
        rulesetVersion: ruleset.manifest.version,
        era: ruleset.manifest.era,
        now,
        executor: tx,
      })

      await applyImportedSheet({
        investigatorId: investigator.investigatorId,
        sheet,
        skills: review.value.skills,
        occupationIsKnown: new Set(ruleset.occupations.occupations.map((entry) => entry.id)).has(
          sheet.identity.occupationId ?? '',
        ),
        now,
        executor: tx,
      })

      if (parsedInput.campaignId) {
        await linkInvestigator({
          investigatorId: investigator.investigatorId,
          campaignId: parsedInput.campaignId,
          linkedBy: ctx.user.id,
          now,
          executor: tx,
        })
      }

      await recordAudit(
        {
          actorId: ctx.user.id,
          action: 'investigator.imported',
          entityType: 'investigator',
          entityId: investigator.investigatorId,
          metadata: {
            ruleset: parsed.data.ruleset.id,
            claimedVersion: parsed.data.ruleset.version,
            warnings: review.value.warnings.length,
          },
        },
        tx,
      )

      return investigator
    })

    revalidatePath('/investigators')

    return {
      ok: true,
      investigatorId: created.investigatorId,
      warnings: review.value.warnings,
    }
  })

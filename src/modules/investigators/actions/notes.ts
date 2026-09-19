'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/db/client'
import { recordAudit } from '@/lib/audit'
import { DomainRuleError, ForbiddenError } from '@/lib/errors'
import { authActionClient } from '@/lib/safe-action'
import { sanitizeUserText } from '@/lib/text/sanitize'
import {
  audienceLosingAccess,
  canWriteNote,
  isReduction,
  validateVisibility,
} from '../domain/notes'
import { reviseNoteSchema, writeNoteSchema } from '../domain/schemas'
import { listCampaignPlayers } from '../data/campaign-bindings'
import { requireInvestigatorAccess } from '../data/guards'
import { findInvestigatorState } from '../data/investigator-store'
import { addRevision, createNote, discloseRevision, findNote } from '../data/notes'
import { findLatestDisclosure } from '../data/snapshots'

/**
 * Writing about a character.
 *
 * The rule that shapes all of this: narrowing a note never takes back what
 * somebody has already read. An edit is a new revision, and when the audience
 * shrinks the people leaving it are handed the revision they had - so a Keeper
 * can stop sharing something without rewriting what the table already knows.
 *
 * A player's observation of somebody else's character is author-only by
 * construction rather than by default. It cannot be shared at all, which is the
 * reason people write them honestly.
 */
export const writeInvestigatorNote = authActionClient
  .metadata({ name: 'investigator.writeNote' })
  .inputSchema(writeNoteSchema)
  .action(async ({ parsedInput, ctx }) => {
    const context = await requireInvestigatorAccess(parsedInput.investigatorId, 'WRITE_OBSERVATION')

    const allowed = canWriteNote(context.role, parsedInput.kind)
    if (!allowed.ok) throw new ForbiddenError()

    const visibility =
      parsedInput.kind === 'KEEPER' ? parsedInput.visibility : ('AUTHOR_ONLY' as const)

    const valid = validateVisibility(parsedInput.kind, visibility)
    if (!valid.ok) throw new DomainRuleError(valid.error.key)

    const content = sanitizeUserText(parsedInput.content, {
      maxLength: 4000,
      allowLineBreaks: true,
    })
    if (content.length === 0) throw new DomainRuleError('investigators.errors.noteEmpty')

    const now = new Date()

    const noteId = await db.transaction(async (tx) => {
      /*
       * Section 16. An observation written about somebody else's character
       * points at the sheet its author could see. Usually there is none yet -
       * they can still see it live - and the pin is applied later, when their
       * access ends. This covers the other case: writing about a character the
       * author has already stopped seeing.
       */
      const disclosure =
        parsedInput.kind === 'PLAYER_OBSERVATION'
          ? await findLatestDisclosure({
              investigatorId: parsedInput.investigatorId,
              viewerId: ctx.user.id,
              executor: tx,
            })
          : null

      const id = await createNote({
        investigatorId: parsedInput.investigatorId,
        campaignId: parsedInput.campaignId ?? null,
        authorId: ctx.user.id,
        kind: parsedInput.kind,
        content,
        visibility,
        disclosureSnapshotId: disclosure?.id ?? null,
        now,
        executor: tx,
      })

      /*
       * Nothing is announced. Section 21 lists no event for a note being
       * shared, and borrowing another type would put "a character was linked to
       * a campaign" in somebody's inbox because a Keeper wrote a sentence. A
       * note shared with an owner who never hears about it is a gap worth
       * closing, but with an event of its own.
       */
      return id
    })

    revalidatePath(`/investigators/${parsedInput.investigatorId}`)

    return { ok: true, noteId }
  })

export const reviseInvestigatorNote = authActionClient
  .metadata({ name: 'investigator.reviseNote' })
  .inputSchema(reviseNoteSchema)
  .action(async ({ parsedInput, ctx }) => {
    const note = await findNote(parsedInput.noteId)

    // Only the author revises their own note; sharing is not co-authorship.
    if (note.authorId !== ctx.user.id) throw new ForbiddenError()

    await requireInvestigatorAccess(note.investigatorId, 'WRITE_OBSERVATION')

    const visibility = note.kind === 'KEEPER' ? parsedInput.visibility : ('AUTHOR_ONLY' as const)
    const valid = validateVisibility(note.kind, visibility)
    if (!valid.ok) throw new DomainRuleError(valid.error.key)

    const content = sanitizeUserText(parsedInput.content, {
      maxLength: 4000,
      allowLineBreaks: true,
    })
    if (content.length === 0) throw new DomainRuleError('investigators.errors.noteEmpty')

    const now = new Date()

    const captured = await db.transaction(async (tx) => {
      let disclosed = 0

      /*
       * Captured before the new revision exists, and against the old one: the
       * point is to preserve what those people were reading, not what replaces
       * it.
       */
      if (isReduction(note.visibility, visibility) && note.campaignId) {
        const investigator = await findInvestigatorState(note.investigatorId, tx)
        const members = await listCampaignPlayers(note.campaignId, tx)

        disclosed = await discloseRevision({
          revisionId: note.revisionId,
          viewerIds: audienceLosingAccess({
            from: note.visibility,
            to: visibility,
            keeperIds: members.filter((member) => member.isKeeper).map((member) => member.userId),
            ownerId: investigator.ownerId,
            campaignMemberIds: members.map((member) => member.userId),
            authorId: note.authorId,
          }),
          now,
          executor: tx,
        })
      }

      await addRevision({
        noteId: note.id,
        content,
        visibility,
        createdBy: ctx.user.id,
        now,
        executor: tx,
      })

      if (disclosed > 0) {
        await recordAudit(
          {
            actorId: ctx.user.id,
            action: 'investigator.noteRestricted',
            entityType: 'investigator',
            entityId: note.investigatorId,
            metadata: { noteId: note.id, disclosures: disclosed },
          },
          tx,
        )
      }

      return disclosed
    })

    revalidatePath(`/investigators/${note.investigatorId}`)

    return { ok: true, disclosures: captured }
  })

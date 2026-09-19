'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/db/client'
import { recordAudit } from '@/lib/audit'
import { authActionClient } from '@/lib/safe-action'
import { saveVisibilitySchema } from '../domain/schemas'
import { isInvestigatorFieldKey } from '../domain/visibility'
import { requireInvestigatorAccess } from '../data/guards'
import { replaceFieldVisibility } from '../data/investigator-store'
import { loadFieldVisibility } from '../data/sheet'
import { captureOnFieldsHidden } from '../data/snapshots'

/**
 * Deciding what the rest of the party can read.
 *
 * Keys are filtered against the registry rather than trusted. The submitted list
 * comes from a form, and a form is a public endpoint: an unknown key would be
 * stored, ignored by the resolver, and look to its owner like a field they had
 * successfully hidden.
 *
 * Hiding something captures first. Section 15 lists this as a moment that
 * reduces access, and it is the only one where nobody's access ends - the party
 * keeps the sheet and loses a part of it. The capture is limited to the saves
 * that actually hide something new: revealing a field, or reordering the same
 * set, takes nothing away and writes nothing.
 */
export const saveFieldVisibility = authActionClient
  .metadata({ name: 'investigator.savePrivacy' })
  .inputSchema(saveVisibilitySchema)
  .action(async ({ parsedInput, ctx }) => {
    await requireInvestigatorAccess(parsedInput.investigatorId, 'CONFIGURE_PRIVACY')

    const hidden = [...new Set(parsedInput.hidden)].filter(isInvestigatorFieldKey)
    const now = new Date()

    const captured = await db.transaction(async (tx) => {
      /*
       * Read inside the transaction and before the change: what counts as
       * newly hidden has to be decided against the state this save is actually
       * replacing, and the projection has to still contain the field that is
       * about to stop being readable.
       */
      const previous = new Set(
        (await loadFieldVisibility(parsedInput.investigatorId, tx)).flatMap(([key, visibility]) =>
          visibility === 'HIDDEN' ? [key] : [],
        ),
      )
      const narrows = hidden.some((key) => !previous.has(key))

      const disclosures = narrows
        ? await captureOnFieldsHidden({
            investigatorId: parsedInput.investigatorId,
            now,
            executor: tx,
          })
        : 0

      await replaceFieldVisibility({
        investigatorId: parsedInput.investigatorId,
        hidden,
        updatedBy: ctx.user.id,
        now,
        executor: tx,
      })

      await recordAudit(
        {
          actorId: ctx.user.id,
          action: 'investigator.privacyChanged',
          entityType: 'investigator',
          entityId: parsedInput.investigatorId,
          metadata: { hiddenFields: hidden.length, disclosures },
        },
        tx,
      )

      return disclosures
    })

    revalidatePath(`/investigators/${parsedInput.investigatorId}`)

    return { ok: true, hidden, disclosures: captured }
  })

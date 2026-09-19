import 'server-only'
import { db } from '@/db/client'
import { permits } from '../domain/access'
import { canReadNote } from '../domain/notes'
import { type ProjectedSheet, projectSheet } from '../domain/sheet'
import { resolveVisibility } from '../domain/visibility'
import { listCampaignsToRequestFor } from './campaign-bindings'
import { type InvestigatorHistory, loadHistory } from './history'
import { requireInvestigatorAccess } from './guards'
import { loadFieldVisibility, loadSheet } from './sheet'
import { type NoteRecord, listNotes } from './notes'
import { loadProvenance } from './provenance'
import { type ResourceEvent, listResourceEvents } from './resources'
import { type SheetOptions, buildSheetOptions } from './sheet-options'

/**
 * One character, for one reader.
 *
 * The only way a sheet reaches a screen. Authorization, privacy resolution and
 * projection happen in that order and in this one place, so a component cannot
 * receive a value it was not supposed to have and then decline to draw it.
 */
export type InvestigatorView = {
  readonly sheet: ProjectedSheet
  readonly options: SheetOptions
  /**
   * The owner's own privacy settings.
   *
   * Only sent to somebody who may change them. A reader's projection already
   * tells them which fields were withheld; handing the full list of decisions to
   * everybody would say what somebody chose to hide about fields they might not
   * even know exist.
   */
  readonly hiddenFields: readonly string[]
  /**
   * The resource journal, for the history tab.
   *
   * Only for a reader who may see the numbers it describes. A player who cannot
   * read somebody's Sanity must not be handed a list of every point of it lost.
   */
  readonly events: readonly ResourceEvent[]
  /**
   * Notes this reader may actually read.
   *
   * Filtered here rather than in the component: an observation somebody wrote
   * about this character is theirs alone, and a payload carrying it to the table
   * would have disclosed it whatever the screen chose to draw.
   */
  readonly notes: readonly NoteRecord[]
  /** Archived characters are still readable; the Vault simply stops offering them. */
  readonly archived: boolean
  /**
   * Campaigns played, sessions, snapshots and what each evening did.
   *
   * Loaded for anybody who may read the sheet. Every comparison in it is built
   * from projections taken with this reader's role, so the history tab can
   * never say more about a character than the sheet above it does.
   */
  readonly history: InvestigatorHistory
  /**
   * Campaigns this reader keeps and could ask for the character in.
   *
   * Empty for everybody who is not a Keeper of somewhere the owner also plays,
   * which is most readers. The names are campaigns the reader runs, so nothing
   * here tells them anything about the owner they did not already know.
   */
  readonly requestable: readonly { readonly campaignId: string; readonly name: string }[]
  readonly provenance: Provenance
  readonly viewer: {
    readonly userId: string
    readonly isOwner: boolean
    readonly canEdit: boolean
    readonly canConfigurePrivacy: boolean
    readonly role: string
  }
}

export async function getInvestigatorView(investigatorId: string): Promise<InvestigatorView> {
  const context = await requireInvestigatorAccess(investigatorId, 'VIEW_CURRENT')

  const [sheet, overrides] = await Promise.all([
    loadSheet(investigatorId, db),
    loadFieldVisibility(investigatorId, db),
  ])

  const canReadResources = permits(context.role, 'VIEW_FULL')
  const events = canReadResources ? await listResourceEvents(investigatorId, 50, db) : []

  const provenance = await loadProvenance(investigatorId, db)
  const history = await loadHistory({ investigatorId, role: context.role, executor: db })

  const notes = (await listNotes(investigatorId, db)).filter((note) =>
    canReadNote({
      kind: note.kind,
      visibility: note.visibility,
      viewerId: context.user.id,
      authorId: note.authorId,
      role: context.role,
    }),
  )

  const canConfigurePrivacy = permits(context.role, 'CONFIGURE_PRIVACY')

  const requestable =
    context.role === 'OWNER'
      ? []
      : await listCampaignsToRequestFor({
          investigatorId,
          keeperId: context.user.id,
          ownerId: context.ownerId,
          executor: db,
        })

  return {
    sheet: projectSheet(sheet, resolveVisibility(overrides), context.role),
    events,
    notes,
    archived: context.archivedAt !== null,
    history,
    requestable,
    provenance,
    hiddenFields: canConfigurePrivacy
      ? overrides.flatMap(([key, visibility]) => (visibility === 'HIDDEN' ? [key] : []))
      : [],
    options: buildSheetOptions({
      rulesetId: sheet.rulesetId,
      rulesetVersion: sheet.rulesetVersion,
      characteristics: sheet.characteristics,
      occupationId: sheet.identity.occupationId,
      occupationCharacteristic: sheet.identity.occupationCharacteristic,
    }),
    viewer: {
      userId: context.user.id,
      isOwner: context.role === 'OWNER',
      canEdit: permits(context.role, 'EDIT_SHEET'),
      canConfigurePrivacy,
      role: context.role,
    },
  }
}

/**
 * Where a character came from.
 *
 * Section 24 calls this provenance and marks it must-have, and the reason is
 * that a lineage only means something if somebody can see it: a character that
 * was handed over twice and branched once looks exactly like a fresh one until
 * the history is shown.
 *
 * Read for anybody who may see the sheet, because none of it is private - who
 * made a character and who has held it is campaign knowledge, not sheet
 * contents.
 */
export type Provenance = {
  readonly rulesetId: string
  readonly rulesetVersion: string
  readonly creationMethod: string
  readonly createdAt: Date
  readonly creatorName: string | null
  readonly ownerName: string
  readonly branchedFrom: { readonly id: string; readonly name: string | null } | null
  readonly siblings: number
  readonly transfers: readonly {
    readonly fromOwnerName: string
    readonly toOwnerName: string
    readonly status: string
    readonly decidedAt: Date | null
  }[]
}

export async function getProvenance(investigatorId: string): Promise<Provenance> {
  await requireInvestigatorAccess(investigatorId, 'VIEW_CURRENT')
  return loadProvenance(investigatorId, db)
}

import 'server-only'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { type DbOrTx, db } from '@/db/client'
import {
  campaign,
  campaignInvestigator,
  gameSession,
  investigatorSnapshot,
  sessionInvestigatorAssignment,
  sessionParticipant,
} from '@/db/schema'
import type { InvestigatorRole } from '../domain/access'
import { type SheetComparison, compareSheets } from '../domain/comparison'
import {
  SHEET_SCHEMA_VERSION,
  type InvestigatorSheet,
  type SheetSnapshotPayload,
  projectSheet,
} from '../domain/sheet'
import { resolveVisibility } from '../domain/visibility'

/**
 * Everything that has happened to one character.
 *
 * Section 9 asks the history tab for campaigns, sessions, transfers,
 * snapshots, ownership changes, resource events and version comparison.
 * Transfers and ownership live in provenance and the journal is loaded with the
 * sheet; this is the rest of it.
 *
 * Every comparison is computed from projections rather than from the stored
 * sheets. A snapshot holds the character in full together with the privacy
 * settings that were in force over it, which is what makes a historical
 * projection possible at all - and comparing the raw pair would tell a reader
 * how much Sanity somebody lost on an evening whose owner hides their Sanity.
 */
export type InvestigatorHistory = {
  readonly campaigns: readonly {
    readonly campaignId: string
    readonly name: string
    readonly linkedAt: Date
    readonly unlinkedAt: Date | null
  }[]
  readonly sessions: readonly {
    readonly sessionId: string
    readonly title: string
    readonly campaignName: string
    readonly playedAt: Date | null
    readonly comparison: SheetComparison | null
  }[]
  readonly snapshots: readonly {
    readonly id: string
    readonly kind: string
    readonly createdAt: Date
    readonly sessionTitle: string | null
  }[]
}

/** The stored payload, once it has been confirmed to be a shape this build reads. */
function readPayload(state: unknown): SheetSnapshotPayload | null {
  const payload = state as Partial<SheetSnapshotPayload>
  if (payload?.schemaVersion !== SHEET_SCHEMA_VERSION) return null
  if (!payload.sheet) return null

  return {
    schemaVersion: payload.schemaVersion,
    sheet: payload.sheet,
    visibility: payload.visibility ?? [],
  }
}

/** One snapshot as this reader is allowed to see it. */
function projectPayload(payload: SheetSnapshotPayload, role: InvestigatorRole): InvestigatorSheet {
  return projectSheet(payload.sheet, resolveVisibility(payload.visibility), role)
}

export async function loadHistory(input: {
  investigatorId: string
  role: InvestigatorRole
  limit?: number
  executor?: DbOrTx
}): Promise<InvestigatorHistory> {
  const executor = input.executor ?? db
  const limit = input.limit ?? 20

  const campaigns = await executor
    .select({
      campaignId: campaign.id,
      name: campaign.name,
      linkedAt: campaignInvestigator.linkedAt,
      unlinkedAt: campaignInvestigator.unlinkedAt,
    })
    .from(campaignInvestigator)
    .innerJoin(campaign, eq(campaign.id, campaignInvestigator.campaignId))
    .where(eq(campaignInvestigator.investigatorId, input.investigatorId))
    .orderBy(desc(campaignInvestigator.linkedAt))

  const assignments = await executor
    .select({
      sessionId: gameSession.id,
      title: gameSession.title,
      campaignName: campaign.name,
      playedAt: gameSession.confirmedStartUtc,
      startSnapshotId: sessionInvestigatorAssignment.startSnapshotId,
      endSnapshotId: sessionInvestigatorAssignment.endSnapshotId,
    })
    .from(sessionInvestigatorAssignment)
    .innerJoin(
      sessionParticipant,
      eq(sessionParticipant.id, sessionInvestigatorAssignment.sessionParticipantId),
    )
    .innerJoin(gameSession, eq(gameSession.id, sessionParticipant.gameSessionId))
    .innerJoin(campaign, eq(campaign.id, gameSession.campaignId))
    .where(eq(sessionInvestigatorAssignment.investigatorId, input.investigatorId))
    .orderBy(desc(gameSession.confirmedStartUtc), desc(gameSession.id))
    .limit(limit)

  const snapshots = await executor
    .select({
      id: investigatorSnapshot.id,
      kind: investigatorSnapshot.kind,
      createdAt: investigatorSnapshot.createdAt,
      sessionTitle: gameSession.title,
    })
    .from(investigatorSnapshot)
    .leftJoin(gameSession, eq(gameSession.id, investigatorSnapshot.gameSessionId))
    .where(eq(investigatorSnapshot.investigatorId, input.investigatorId))
    .orderBy(desc(investigatorSnapshot.createdAt), desc(investigatorSnapshot.id))
    .limit(limit)

  const wanted = assignments.flatMap((row) =>
    row.startSnapshotId && row.endSnapshotId ? [row.startSnapshotId, row.endSnapshotId] : [],
  )

  const states =
    wanted.length === 0
      ? []
      : await executor
          .select({ id: investigatorSnapshot.id, state: investigatorSnapshot.state })
          .from(investigatorSnapshot)
          .where(
            and(
              inArray(investigatorSnapshot.id, wanted),
              eq(investigatorSnapshot.investigatorId, input.investigatorId),
            ),
          )

  const sessions = assignments.map((row) => {
    const before = states.find((state) => state.id === row.startSnapshotId)
    const after = states.find((state) => state.id === row.endSnapshotId)

    const beforePayload = before ? readPayload(before.state) : null
    const afterPayload = after ? readPayload(after.state) : null

    return {
      sessionId: row.sessionId,
      title: row.title,
      campaignName: row.campaignName,
      playedAt: row.playedAt,
      comparison:
        beforePayload && afterPayload
          ? compareSheets(
              projectPayload(beforePayload, input.role),
              projectPayload(afterPayload, input.role),
            )
          : null,
    }
  })

  return { campaigns, sessions, snapshots }
}

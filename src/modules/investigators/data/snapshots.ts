import 'server-only'
import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import { type DbOrTx, db } from '@/db/client'
import {
  campaign,
  campaignInvestigator,
  campaignMember,
  investigatorProfile,
  investigator,
  investigatorAccessGrant,
  investigatorDisclosureSnapshot,
  investigatorSnapshot,
  sessionInvestigatorAssignment,
  sessionParticipant,
} from '@/db/schema'
import { newId } from '@/lib/ids'
import { type InvestigatorRole, resolveRole } from '../domain/access'
import { SHEET_SCHEMA_VERSION, projectSheet } from '../domain/sheet'
import type { ProjectedSheet } from '../domain/sheet'
import type { InvestigatorSheet, SheetSnapshotPayload } from '../domain/sheet'
import { resolveVisibility } from '../domain/visibility'
import { attachDisclosureToObservations } from './notes'
import { loadFieldVisibility, loadSheet } from './sheet'

/**
 * Immutable history.
 *
 * Two kinds of record, and the difference is the whole of section 15 of the
 * plan. A snapshot is the character as it was; a disclosure is the character as
 * one particular person was allowed to see it. Keeping them apart is what lets
 * somebody retain what they were shown after their access ends, without that
 * turning into a permanent window onto a sheet they no longer have any claim to.
 *
 * Both are append-only. Nothing here updates or deletes: a history that can be
 * revised is not history, and the promise the product makes is that information
 * already given cannot be taken back.
 */
export type SnapshotKind =
  'SESSION_START' | 'SESSION_END' | 'TRANSFER' | 'ACCESS_REDUCTION' | 'MANUAL'

export type DisclosureReason =
  | 'FIELD_HIDDEN'
  | 'CAMPAIGN_UNLINKED'
  | 'CAMPAIGN_LEFT'
  | 'CAMPAIGN_ENDED'
  | 'TRANSFERRED'
  | 'NOTE_RESTRICTED'
  | 'MANUAL'

/**
 * Records the character exactly as it stands.
 *
 * The full sheet, unredacted, together with the privacy settings in force over
 * it: this is the archival copy rather than anybody's view of it. It is never
 * served to a reader directly - disclosures are - which is why section 22
 * insists the two have separate endpoints.
 */
export async function captureSnapshot(input: {
  investigatorId: string
  kind: SnapshotKind
  campaignId?: string | null
  gameSessionId?: string | null
  createdBy?: string | null
  now: Date
  executor: DbOrTx
}): Promise<string> {
  const [sheet, visibility] = await Promise.all([
    loadSheet(input.investigatorId, input.executor),
    loadFieldVisibility(input.investigatorId, input.executor),
  ])

  const payload: SheetSnapshotPayload = {
    schemaVersion: SHEET_SCHEMA_VERSION,
    sheet,
    visibility,
  }

  const id = newId()

  await input.executor.insert(investigatorSnapshot).values({
    id,
    investigatorId: input.investigatorId,
    kind: input.kind,
    campaignId: input.campaignId ?? null,
    gameSessionId: input.gameSessionId ?? null,
    schemaVersion: SHEET_SCHEMA_VERSION,
    state: payload,
    createdBy: input.createdBy ?? null,
    createdAt: input.now,
  })

  return id
}

/**
 * Records what one person could see, at the moment they stopped being able to.
 *
 * Taken before access is reduced rather than after, which is the only ordering
 * that works: afterwards the viewer's role has already changed, and the
 * projection would capture what they may see now - which is the thing being
 * taken away.
 */
export async function captureDisclosure(input: {
  investigatorId: string
  viewerId: string
  role: InvestigatorRole
  reason: DisclosureReason
  campaignId?: string | null
  sourceSnapshotId?: string | null
  now: Date
  executor: DbOrTx
}): Promise<string> {
  const [sheet, overrides] = await Promise.all([
    loadSheet(input.investigatorId, input.executor),
    loadFieldVisibility(input.investigatorId, input.executor),
  ])

  const projection = projectSheet(sheet, resolveVisibility(overrides), input.role)
  const id = newId()

  await input.executor.insert(investigatorDisclosureSnapshot).values({
    id,
    investigatorId: input.investigatorId,
    viewerId: input.viewerId,
    campaignId: input.campaignId ?? null,
    sourceSnapshotId: input.sourceSnapshotId ?? null,
    reason: input.reason,
    schemaVersion: SHEET_SCHEMA_VERSION,
    projection,
    createdAt: input.now,
  })

  /*
   * Section 16: an observation references the latest disclosure available to
   * its author. Done here rather than at each call site because this is the one
   * place a disclosure is ever written, and a note whose sheet went missing is
   * not something anybody would notice until it mattered.
   */
  await attachDisclosureToObservations({
    investigatorId: input.investigatorId,
    authorId: input.viewerId,
    disclosureSnapshotId: id,
    executor: input.executor,
  })

  return id
}

/**
 * Everyone who can currently see this character through a campaign.
 *
 * Read before a binding is removed so that each of them can be handed what they
 * had. The owner is excluded: they are not losing anything, and a disclosure
 * addressed to the owner would be a copy of the sheet they still hold.
 */
export async function listCampaignViewers(input: {
  investigatorId: string
  campaignId: string
  executor: DbOrTx
}): Promise<{ viewerId: string; role: InvestigatorRole }[]> {
  const owner = await input.executor
    .select({ ownerId: investigator.ownerId })
    .from(investigator)
    .where(eq(investigator.id, input.investigatorId))
    .limit(1)
    .then((rows) => rows[0])

  if (!owner) return []

  const rows = await input.executor
    .select({ userId: campaignMember.userId, role: campaignMember.role })
    .from(campaignMember)
    .where(
      and(eq(campaignMember.campaignId, input.campaignId), eq(campaignMember.status, 'ACTIVE')),
    )

  return rows
    .filter((row) => row.userId !== owner.ownerId)
    .map((row) => ({
      viewerId: row.userId,
      role: resolveRole({
        viewerId: row.userId,
        ownerId: owner.ownerId,
        hasOpenEditGrant: false,
        keepsLinkedCampaign: row.role === 'KEEPER',
        playsLinkedCampaign: true,
        hasHistoricalAccess: false,
      }),
    }))
    .flatMap((entry) => (entry.role === null ? [] : [{ ...entry, role: entry.role }]))
}

/**
 * Ends live access and leaves the viewer with what they were shown.
 *
 * One transaction's worth of work, always in this order: capture first, then
 * close. Closing first would leave a window in which the grant is gone and the
 * disclosure does not exist yet, and a failure inside it would lose the
 * information permanently rather than merely delaying it.
 */
export async function endAccessWithDisclosure(input: {
  investigatorId: string
  viewerId: string
  role: InvestigatorRole
  reason: DisclosureReason
  campaignId?: string | null
  now: Date
  executor: DbOrTx
}): Promise<string> {
  const disclosureId = await captureDisclosure(input)

  const existing = await input.executor
    .select({ id: investigatorAccessGrant.id })
    .from(investigatorAccessGrant)
    .where(
      and(
        eq(investigatorAccessGrant.investigatorId, input.investigatorId),
        eq(investigatorAccessGrant.viewerId, input.viewerId),
        isNull(investigatorAccessGrant.endedAt),
      ),
    )
    .limit(1)
    .then((rows) => rows[0])

  if (existing) {
    await input.executor
      .update(investigatorAccessGrant)
      .set({
        endedAt: input.now,
        finalDisclosureSnapshotId: disclosureId,
        updatedAt: input.now,
      })
      .where(eq(investigatorAccessGrant.id, existing.id))
  } else {
    /*
     * No live grant row, but the person could still see the sheet through their
     * campaign membership. The record is written closed: what matters is that
     * they keep the disclosure, not that they briefly held a row.
     */
    await input.executor.insert(investigatorAccessGrant).values({
      id: newId(),
      investigatorId: input.investigatorId,
      viewerId: input.viewerId,
      campaignId: input.campaignId ?? null,
      level: input.role === 'KEEPER' ? 'KEEPER' : 'PLAYER',
      grantedAt: input.now,
      endedAt: input.now,
      finalDisclosureSnapshotId: disclosureId,
      createdAt: input.now,
      updatedAt: input.now,
    })
  }

  return disclosureId
}

/**
 * Removes a character from a campaign, preserving what everybody there had seen.
 *
 * The binding is closed and every viewer keeps their own projection. History of
 * the sessions it was played in is untouched - unlinking is about what happens
 * from now on, not about editing what happened.
 */
export async function unlinkFromCampaign(input: {
  investigatorId: string
  campaignId: string
  reason: string | null
  now: Date
  executor: DbOrTx
}): Promise<number> {
  const viewers = await listCampaignViewers(input)

  for (const viewer of viewers) {
    await endAccessWithDisclosure({
      investigatorId: input.investigatorId,
      viewerId: viewer.viewerId,
      role: viewer.role,
      reason: 'CAMPAIGN_UNLINKED',
      campaignId: input.campaignId,
      now: input.now,
      executor: input.executor,
    })
  }

  await input.executor
    .update(campaignInvestigator)
    .set({ unlinkedAt: input.now, unlinkReason: input.reason, updatedAt: input.now })
    .where(
      and(
        eq(campaignInvestigator.investigatorId, input.investigatorId),
        eq(campaignInvestigator.campaignId, input.campaignId),
        isNull(campaignInvestigator.unlinkedAt),
      ),
    )

  return viewers.length
}

/** What a viewer keeps: their most recent disclosure of this character. */
export async function findLatestDisclosure(input: {
  investigatorId: string
  viewerId: string
  executor?: DbOrTx
}): Promise<{ id: string; projection: unknown; createdAt: Date } | null> {
  const executor = input.executor ?? db

  const row = await executor
    .select({
      id: investigatorDisclosureSnapshot.id,
      projection: investigatorDisclosureSnapshot.projection,
      createdAt: investigatorDisclosureSnapshot.createdAt,
    })
    .from(investigatorDisclosureSnapshot)
    .where(
      and(
        eq(investigatorDisclosureSnapshot.investigatorId, input.investigatorId),
        eq(investigatorDisclosureSnapshot.viewerId, input.viewerId),
      ),
    )
    /*
     * Newest first with the identifier breaking the tie, then one row. Loading
     * every disclosure to keep the last of them is wasteful, and ordering on the
     * timestamp alone picks arbitrarily between two written in one transaction -
     * which is exactly what unlinking a character from a campaign does.
     */
    .orderBy(
      desc(investigatorDisclosureSnapshot.createdAt),
      desc(investigatorDisclosureSnapshot.id),
    )
    .limit(1)
    .then((rows) => rows[0])

  return row ?? null
}

/**
 * The pair of snapshots a session took of one character.
 *
 * Read through the assignment rather than by searching for snapshots of the
 * right kind: the assignment points at exactly the two that belong to that
 * evening, which is why it carries them at all.
 */
export async function findSessionSnapshots(input: {
  sessionId: string
  investigatorId: string
  /** The reader's standing toward this character; the pair is projected for it. */
  role: InvestigatorRole
  executor?: DbOrTx
}): Promise<{ before: InvestigatorSheet; after: InvestigatorSheet } | null> {
  const executor = input.executor ?? db

  const assignment = await executor
    .select({
      startSnapshotId: sessionInvestigatorAssignment.startSnapshotId,
      endSnapshotId: sessionInvestigatorAssignment.endSnapshotId,
    })
    .from(sessionInvestigatorAssignment)
    .innerJoin(
      sessionParticipant,
      eq(sessionParticipant.id, sessionInvestigatorAssignment.sessionParticipantId),
    )
    .where(
      and(
        eq(sessionParticipant.gameSessionId, input.sessionId),
        eq(sessionInvestigatorAssignment.investigatorId, input.investigatorId),
      ),
    )
    .limit(1)
    .then((rows) => rows[0])

  if (!assignment?.startSnapshotId || !assignment.endSnapshotId) return null

  const rows = await executor
    .select({ id: investigatorSnapshot.id, state: investigatorSnapshot.state })
    .from(investigatorSnapshot)
    .where(inArray(investigatorSnapshot.id, [assignment.startSnapshotId, assignment.endSnapshotId]))

  const before = rows.find((row) => row.id === assignment.startSnapshotId)
  const after = rows.find((row) => row.id === assignment.endSnapshotId)
  if (!before || !after) return null

  /*
   * The version is checked rather than assumed. The column exists precisely so
   * that a payload written by an older build is recognised instead of being
   * read as though it had this shape - which would surface as a comparison
   * crashing on a sheet that has no skills array.
   */
  const payloads = [before, after].map((row) => row.state as Partial<SheetSnapshotPayload>)
  if (payloads.some((payload) => payload.schemaVersion !== SHEET_SCHEMA_VERSION)) return null

  const beforeSheet = payloads[0]?.sheet
  const afterSheet = payloads[1]?.sheet
  if (!beforeSheet || !afterSheet) return null

  /*
   * Projected before it leaves the data layer. A snapshot holds the character
   * whole together with the privacy that was in force over it, and a pair
   * compared raw would tell a table how much Sanity somebody lost on an evening
   * whose owner hides their Sanity - the archive would leak what the sheet does
   * not.
   */
  const beforeVisibility = resolveVisibility(payloads[0]?.visibility ?? [])
  const afterVisibility = resolveVisibility(payloads[1]?.visibility ?? [])

  return {
    before: projectSheet(beforeSheet, beforeVisibility, input.role),
    after: projectSheet(afterSheet, afterVisibility, input.role),
  }
}

/**
 * Everything a person keeps but can no longer reach live.
 *
 * The other half of section 15. Somebody who was shown a character and then
 * stopped being able to see it keeps what they were shown, and until there was
 * a list of it that promise was true only in the database - which is a promise
 * to nobody.
 *
 * Deliberately only what they cannot read any more: a character still in a
 * campaign they are in belongs on its own page, not in an archive of things
 * they used to know.
 */
export async function listKeptDisclosures(input: { viewerId: string; executor?: DbOrTx }): Promise<
  {
    investigatorId: string
    name: string | null
    campaignName: string | null
    reason: DisclosureReason
    disclosedAt: Date
    stillReachable: boolean
  }[]
> {
  const executor = input.executor ?? db

  const rows = await executor
    .select({
      id: investigatorDisclosureSnapshot.id,
      investigatorId: investigatorDisclosureSnapshot.investigatorId,
      name: investigatorProfile.name,
      campaignName: campaign.name,
      reason: investigatorDisclosureSnapshot.reason,
      disclosedAt: investigatorDisclosureSnapshot.createdAt,
      liveCampaignId: campaignInvestigator.campaignId,
      memberStatus: campaignMember.status,
    })
    .from(investigatorDisclosureSnapshot)
    .leftJoin(
      investigatorProfile,
      eq(investigatorProfile.investigatorId, investigatorDisclosureSnapshot.investigatorId),
    )
    .leftJoin(campaign, eq(campaign.id, investigatorDisclosureSnapshot.campaignId))
    .leftJoin(
      campaignInvestigator,
      and(
        eq(campaignInvestigator.investigatorId, investigatorDisclosureSnapshot.investigatorId),
        isNull(campaignInvestigator.unlinkedAt),
      ),
    )
    .leftJoin(
      campaignMember,
      and(
        eq(campaignMember.campaignId, campaignInvestigator.campaignId),
        eq(campaignMember.userId, input.viewerId),
        eq(campaignMember.status, 'ACTIVE'),
      ),
    )
    .where(eq(investigatorDisclosureSnapshot.viewerId, input.viewerId))
    .orderBy(desc(investigatorDisclosureSnapshot.createdAt))

  /*
   * One entry per character, the most recent. Several disclosures of the same
   * sheet are the same memory captured twice, and a list that showed both would
   * be describing the mechanism rather than what somebody kept.
   */
  const seen = new Set<string>()

  return rows.flatMap((row) => {
    if (seen.has(row.investigatorId)) return []
    seen.add(row.investigatorId)

    return [
      {
        investigatorId: row.investigatorId,
        name: row.name,
        campaignName: row.campaignName,
        reason: row.reason,
        disclosedAt: row.disclosedAt,
        stillReachable: row.memberStatus === 'ACTIVE',
      },
    ]
  })
}

/** One kept projection, for the person it was captured for. */
export async function readKeptDisclosure(input: {
  investigatorId: string
  viewerId: string
  /** One particular capture; the most recent one when this is absent. */
  snapshotId?: string | null
  executor?: DbOrTx
}): Promise<{ sheet: ProjectedSheet; disclosedAt: Date; reason: DisclosureReason } | null> {
  const executor = input.executor ?? db

  const row = await executor
    .select({
      projection: investigatorDisclosureSnapshot.projection,
      schemaVersion: investigatorDisclosureSnapshot.schemaVersion,
      reason: investigatorDisclosureSnapshot.reason,
      createdAt: investigatorDisclosureSnapshot.createdAt,
    })
    .from(investigatorDisclosureSnapshot)
    .where(
      and(
        eq(investigatorDisclosureSnapshot.investigatorId, input.investigatorId),
        eq(investigatorDisclosureSnapshot.viewerId, input.viewerId),
        /*
         * The viewer is part of the filter rather than a check afterwards: an
         * identifier from a query string must never be able to read somebody
         * else's projection.
         */
        ...(input.snapshotId ? [eq(investigatorDisclosureSnapshot.id, input.snapshotId)] : []),
      ),
    )
    .orderBy(
      desc(investigatorDisclosureSnapshot.createdAt),
      desc(investigatorDisclosureSnapshot.id),
    )
    .limit(1)
    .then((rows) => rows[0])

  if (!row || row.schemaVersion !== SHEET_SCHEMA_VERSION) return null

  return {
    sheet: row.projection as ProjectedSheet,
    disclosedAt: row.createdAt,
    reason: row.reason,
  }
}

/**
 * Hands somebody everything they could see in a campaign, before they stop.
 *
 * Section 15 lists six moments that reduce access. Removing a character from a
 * campaign was wired; a member leaving and a campaign ending were not, and those
 * are the two that happen to people rather than to characters. Somebody who
 * walks out of a campaign kept nothing at all, which is exactly the promise this
 * section makes.
 *
 * The person's own characters are skipped. They are not losing those.
 */
export async function captureOnLeavingCampaign(input: {
  campaignId: string
  viewerId: string
  reason: Extract<DisclosureReason, 'CAMPAIGN_LEFT' | 'CAMPAIGN_ENDED'>
  now: Date
  executor: DbOrTx
}): Promise<number> {
  const rows = await input.executor
    .select({
      investigatorId: campaignInvestigator.investigatorId,
      ownerId: investigator.ownerId,
      role: campaignMember.role,
    })
    .from(campaignInvestigator)
    .innerJoin(investigator, eq(investigator.id, campaignInvestigator.investigatorId))
    .leftJoin(
      campaignMember,
      and(
        eq(campaignMember.campaignId, campaignInvestigator.campaignId),
        eq(campaignMember.userId, input.viewerId),
      ),
    )
    .where(
      and(
        eq(campaignInvestigator.campaignId, input.campaignId),
        isNull(campaignInvestigator.unlinkedAt),
      ),
    )

  let captured = 0

  for (const row of rows) {
    if (row.ownerId === input.viewerId) continue

    await endAccessWithDisclosure({
      investigatorId: row.investigatorId,
      viewerId: input.viewerId,
      role: row.role === 'KEEPER' ? 'KEEPER' : 'PLAYER',
      reason: input.reason,
      campaignId: input.campaignId,
      now: input.now,
      executor: input.executor,
    })

    captured += 1
  }

  return captured
}

/**
 * The same, for everybody still in a campaign that is ending.
 *
 * Run when a campaign is archived. Each member keeps the characters as they
 * stood on the last day, which is what "after a campaign ends, a Keeper retains
 * the final full campaign-context projection" means in practice.
 */
export async function captureOnCampaignEnd(input: {
  campaignId: string
  now: Date
  executor: DbOrTx
}): Promise<number> {
  const members = await input.executor
    .select({ userId: campaignMember.userId })
    .from(campaignMember)
    .where(
      and(eq(campaignMember.campaignId, input.campaignId), eq(campaignMember.status, 'ACTIVE')),
    )

  let captured = 0

  for (const member of members) {
    captured += await captureOnLeavingCampaign({
      campaignId: input.campaignId,
      viewerId: member.userId,
      reason: 'CAMPAIGN_ENDED',
      now: input.now,
      executor: input.executor,
    })
  }

  return captured
}

/**
 * Captures what everybody could see, before a field stops being readable.
 *
 * Section 15 lists hiding a field first among the moments that reduce access,
 * and it is the only one where nobody's access ends: the party keeps the sheet
 * and loses one part of it. Without this, somebody who read a value yesterday
 * loses it today and the disclosure taken when they eventually leave records
 * the field as already hidden - the promise would be kept for every way of
 * losing access except the most ordinary one.
 *
 * Run only when something is newly hidden, and before the change is written.
 * A viewer in two campaigns with this character is captured once, with the
 * stronger standing, because a projection is about a person rather than a
 * membership.
 *
 * Only players are captured. Section 14 gives a Keeper the campaign-context
 * sheet in full, so hiding a field takes nothing from them - and a disclosure
 * recording that would be a copy of a sheet they can still read.
 */
export async function captureOnFieldsHidden(input: {
  investigatorId: string
  now: Date
  executor: DbOrTx
}): Promise<number> {
  const bindings = await input.executor
    .select({ campaignId: campaignInvestigator.campaignId })
    .from(campaignInvestigator)
    .where(
      and(
        eq(campaignInvestigator.investigatorId, input.investigatorId),
        isNull(campaignInvestigator.unlinkedAt),
      ),
    )

  const strongest = new Map<string, { role: InvestigatorRole; campaignId: string }>()
  const keepers = new Set<string>()

  for (const binding of bindings) {
    const viewers = await listCampaignViewers({
      investigatorId: input.investigatorId,
      campaignId: binding.campaignId,
      executor: input.executor,
    })

    for (const viewer of viewers) {
      if (viewer.role !== 'PLAYER') {
        strongest.delete(viewer.viewerId)
        keepers.add(viewer.viewerId)
        continue
      }
      if (keepers.has(viewer.viewerId)) continue
      strongest.set(viewer.viewerId, { role: viewer.role, campaignId: binding.campaignId })
    }
  }

  for (const [viewerId, standing] of strongest) {
    await captureDisclosure({
      investigatorId: input.investigatorId,
      viewerId,
      role: standing.role,
      reason: 'FIELD_HIDDEN',
      campaignId: standing.campaignId,
      now: input.now,
      executor: input.executor,
    })
  }

  return strongest.size
}

/**
 * Every moment this person was shown this character.
 *
 * The newest capture is not always the richest. Hiding a field takes one while
 * everybody keeps their access, and if the same person later leaves the
 * campaign the capture taken then records the field as already hidden - so
 * "what you were shown" is a list of moments rather than a single latest state.
 * Section 15 promises the exact information previously disclosed, and this is
 * how somebody reaches all of it.
 */
export async function listDisclosuresFor(input: {
  investigatorId: string
  viewerId: string
  executor?: DbOrTx
}): Promise<{ id: string; reason: DisclosureReason; disclosedAt: Date }[]> {
  const executor = input.executor ?? db

  return executor
    .select({
      id: investigatorDisclosureSnapshot.id,
      reason: investigatorDisclosureSnapshot.reason,
      disclosedAt: investigatorDisclosureSnapshot.createdAt,
    })
    .from(investigatorDisclosureSnapshot)
    .where(
      and(
        eq(investigatorDisclosureSnapshot.investigatorId, input.investigatorId),
        eq(investigatorDisclosureSnapshot.viewerId, input.viewerId),
      ),
    )
    .orderBy(
      desc(investigatorDisclosureSnapshot.createdAt),
      desc(investigatorDisclosureSnapshot.id),
    )
}

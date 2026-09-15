import 'server-only'
import { and, desc, eq, inArray, ne } from 'drizzle-orm'
import { type DbOrTx, db } from '@/db/client'
import { authUser, availabilitySlot, gameSession, sessionParticipant } from '@/db/schema'
import { NotFoundError } from '@/lib/errors'
import { generateGridSlots } from '@/lib/datetime/slots'
import { newId } from '@/lib/ids'
import { requireSessionMember } from '@/modules/sessions/data/guards'
import { canSubmitAvailability } from '@/modules/sessions/domain/lifecycle'
import type { SessionStatus } from '@/modules/sessions/domain/types'
import {
  MIN_RESPONDENTS_FOR_HEATMAP,
  bestPerDay,
  summarizeWindows,
  tallySlots,
} from '../domain/aggregate'
import { cellsToRanges, rangeToCells } from '../domain/ranges'
import type {
  AvailabilityCell,
  AvailabilityView,
  DayRange,
  ParticipantAvailability,
} from '../domain/types'

/**
 * Availability reads and writes.
 *
 * The view is assembled per viewer and the narrowing happens here. A Keeper's
 * copy carries names against answers; an Investigator's carries counts and their
 * own answer, and nothing else — there is no payload in which the names are
 * present and merely unrendered.
 */
type SessionShape = {
  id: string
  campaignId: string
  status: string
  timezone: string
  searchWindowStart: string
  searchWindowEnd: string
  gridStartHour: number
  gridEndHour: number
  minSessionHours: number
  quorum: number
  availabilityDeadline: Date | null
}

async function loadSession(sessionId: string, executor: DbOrTx = db): Promise<SessionShape> {
  const row = await executor.query.gameSession.findFirst({
    where: eq(gameSession.id, sessionId),
    columns: {
      id: true,
      campaignId: true,
      status: true,
      timezone: true,
      searchWindowStart: true,
      searchWindowEnd: true,
      gridStartHour: true,
      gridEndHour: true,
      minSessionHours: true,
      quorum: true,
      availabilityDeadline: true,
    },
  })

  if (!row) throw new NotFoundError()
  return row
}

/**
 * The grid this session offers, in the shape the domain speaks.
 *
 * The generator calls the instant `startUtc` and the database column is
 * `slot_start_utc`; renaming once here means neither name leaks into the other's
 * territory, and no code has to remember which it is holding.
 */
function gridFor(
  session: SessionShape,
): { slotStartUtc: string; localDate: string; localHour: number }[] {
  return generateGridSlots({
    startDate: session.searchWindowStart,
    endDate: session.searchWindowEnd,
    startHour: session.gridStartHour,
    endHour: session.gridEndHour,
    timeZone: session.timezone,
  }).map((slot) => ({
    slotStartUtc: slot.startUtc,
    localDate: slot.localDate,
    localHour: slot.localHour,
  }))
}

/**
 * Everything the grid renders, narrowed for its viewer.
 *
 * One query for every answer, then split: the Keeper branch keeps the join to
 * names, the Investigator branch discards it before the data leaves this
 * function.
 */
export async function getAvailabilityView(sessionId: string): Promise<AvailabilityView> {
  const context = await requireSessionMember(sessionId)
  const session = await loadSession(sessionId)
  const isKeeper = context.membership.role === 'KEEPER'

  const slots = gridFor(session)
  const dates = [...new Set(slots.map((slot) => slot.localDate))]

  const participants = await db
    .select({
      userId: sessionParticipant.userId,
      name: authUser.name,
      respondedAt: sessionParticipant.respondedAt,
    })
    .from(sessionParticipant)
    .innerJoin(authUser, eq(authUser.id, sessionParticipant.userId))
    .where(eq(sessionParticipant.gameSessionId, sessionId))

  const cells = await db
    .select({
      userId: availabilitySlot.userId,
      slotStartUtc: availabilitySlot.slotStartUtc,
      localDate: availabilitySlot.localDate,
      localHour: availabilitySlot.localHour,
      state: availabilitySlot.state,
    })
    .from(availabilitySlot)
    .where(eq(availabilitySlot.gameSessionId, sessionId))

  const byUser = new Map<string, AvailabilityCell[]>()
  for (const cell of cells) {
    const entry: AvailabilityCell = {
      slotStartUtc: cell.slotStartUtc.toISOString(),
      localDate: cell.localDate,
      localHour: cell.localHour,
      state: cell.state,
    }
    const bucket = byUser.get(cell.userId)
    if (bucket) bucket.push(entry)
    else byUser.set(cell.userId, [entry])
  }

  const answers = participants.map((participant) => ({
    userId: participant.userId,
    days: cellsToRanges(byUser.get(participant.userId) ?? [], dates),
  }))

  const respondentCount = participants.filter(
    (participant) => participant.respondedAt !== null,
  ).length

  const windows = bestPerDay(
    summarizeWindows({
      answers,
      dates,
      gridStartHour: session.gridStartHour,
      gridEndHour: session.gridEndHour,
      minSessionHours: session.minSessionHours,
      quorum: session.quorum,
      participantCount: participants.length,
    }),
  )

  /*
   * The hour-by-hour breakdown is withheld until enough people have answered to
   * hide in. With two answers, one count plus the viewer's own names the other
   * person exactly. Keepers see it regardless — it is their data to read.
   */
  const discloseTallies = isKeeper || respondentCount >= MIN_RESPONDENTS_FOR_HEATMAP

  const named: ParticipantAvailability[] = isKeeper
    ? participants.map((participant) => ({
        userId: participant.userId,
        name: participant.name,
        respondedAt: participant.respondedAt,
        days: cellsToRanges(byUser.get(participant.userId) ?? [], dates),
      }))
    : []

  return {
    sessionId,
    timezone: session.timezone,
    gridStartHour: session.gridStartHour,
    gridEndHour: session.gridEndHour,
    minSessionHours: session.minSessionHours,
    quorum: session.quorum,
    dates,
    editable: canSubmitAvailability(session.status as SessionStatus).ok,
    status: session.status as SessionStatus,
    deadline: session.availabilityDeadline,
    own: cellsToRanges(byUser.get(context.user.id) ?? [], dates),
    tallies: discloseTallies ? tallySlots(answers, slots, participants.length) : [],
    windows,
    respondentCount,
    participantCount: participants.length,
    participants: named,
  }
}

/**
 * Replaces one participant's answer.
 *
 * Wholesale rather than incremental: the grid submits a complete intent, and
 * diffing it against what is stored would only add a way for the two to drift
 * apart. The user id comes from the session, never from the payload.
 */
export async function saveOwnAvailability(input: {
  sessionId: string
  userId: string
  ranges: readonly DayRange[]
  now: Date
  executor: DbOrTx
}): Promise<{ cellCount: number }> {
  const session = await loadSession(input.sessionId, input.executor)
  const slots = gridFor(session)

  const slotsByDate = new Map<string, { slotStartUtc: string; localHour: number }[]>()
  for (const slot of slots) {
    const bucket = slotsByDate.get(slot.localDate)
    if (bucket) bucket.push(slot)
    else slotsByDate.set(slot.localDate, [slot])
  }

  const cells = input.ranges.flatMap((range) =>
    rangeToCells(range, slotsByDate.get(range.date) ?? []),
  )

  await input.executor
    .delete(availabilitySlot)
    .where(
      and(
        eq(availabilitySlot.gameSessionId, input.sessionId),
        eq(availabilitySlot.userId, input.userId),
      ),
    )

  if (cells.length > 0) {
    await input.executor.insert(availabilitySlot).values(
      cells.map((cell) => ({
        id: newId(),
        gameSessionId: input.sessionId,
        userId: input.userId,
        slotStartUtc: new Date(cell.slotStartUtc),
        localDate: cell.localDate,
        localHour: cell.localHour,
        state: cell.state,
        createdAt: input.now,
        updatedAt: input.now,
      })),
    )
  }

  /*
   * Answering counts even when the answer is "none of these". Leaving
   * respondedAt null would make a deliberate refusal look like silence, and the
   * two mean opposite things to a Keeper chasing replies.
   */
  await input.executor
    .update(sessionParticipant)
    .set({ respondedAt: input.now, updatedAt: input.now })
    .where(
      and(
        eq(sessionParticipant.gameSessionId, input.sessionId),
        eq(sessionParticipant.userId, input.userId),
      ),
    )

  return { cellCount: cells.length }
}

/**
 * The viewer's answer to the most recent other session in the same campaign.
 *
 * Behind "same as last time", which converts a chore repeated every fortnight
 * into a single action. Returns day-of-week shaped data rather than dates,
 * because the dates themselves will not repeat.
 */
export async function findPreviousAnswer(input: {
  sessionId: string
  campaignId: string
  userId: string
}): Promise<{ sessionTitle: string; byWeekday: Map<number, DayRange> } | null> {
  const previous = await db
    .select({ id: gameSession.id, title: gameSession.title })
    .from(gameSession)
    .innerJoin(
      sessionParticipant,
      and(
        eq(sessionParticipant.gameSessionId, gameSession.id),
        eq(sessionParticipant.userId, input.userId),
      ),
    )
    .where(
      and(
        eq(gameSession.campaignId, input.campaignId),
        ne(gameSession.id, input.sessionId),
        ne(sessionParticipant.respondedAt, new Date(0)),
      ),
    )
    .orderBy(desc(gameSession.createdAt))
    .limit(5)

  for (const candidate of previous) {
    const cells = await db
      .select({
        slotStartUtc: availabilitySlot.slotStartUtc,
        localDate: availabilitySlot.localDate,
        localHour: availabilitySlot.localHour,
        state: availabilitySlot.state,
      })
      .from(availabilitySlot)
      .where(
        and(
          eq(availabilitySlot.gameSessionId, candidate.id),
          eq(availabilitySlot.userId, input.userId),
        ),
      )

    if (cells.length === 0) continue

    const dates = [...new Set(cells.map((cell) => cell.localDate))]
    const ranges = cellsToRanges(
      cells.map((cell) => ({
        slotStartUtc: cell.slotStartUtc.toISOString(),
        localDate: cell.localDate,
        localHour: cell.localHour,
        state: cell.state,
      })),
      dates,
    )

    // Keyed by weekday: "I am free on Thursdays" survives into a new window,
    // whereas "I am free on the 8th" does not.
    const byWeekday = new Map<number, DayRange>()
    for (const range of ranges) {
      if (range.state === null) continue
      const weekday = new Date(`${range.date}T12:00:00Z`).getUTCDay()
      if (!byWeekday.has(weekday)) byWeekday.set(weekday, range)
    }

    if (byWeekday.size > 0) return { sessionTitle: candidate.title, byWeekday }
  }

  return null
}

/**
 * Discards every answer to a session.
 *
 * Used when the question changes — the window moves, or the Keeper reopens
 * collection. Marking people as not having answered while leaving their answers
 * in place was the old behaviour, and it produced a session where everybody
 * showed as silent while their stale answers still drove the heatmap and the
 * ranking.
 */
export async function deleteAllAvailability(sessionId: string, executor: DbOrTx): Promise<void> {
  await executor.delete(availabilitySlot).where(eq(availabilitySlot.gameSessionId, sessionId))
}

/** Clears a participant's answer, used when they are dropped from a session. */
export async function deleteAvailabilityFor(
  sessionId: string,
  userIds: readonly string[],
  executor: DbOrTx,
): Promise<void> {
  if (userIds.length === 0) return

  await executor
    .delete(availabilitySlot)
    .where(
      and(
        eq(availabilitySlot.gameSessionId, sessionId),
        inArray(availabilitySlot.userId, [...userIds]),
      ),
    )
}

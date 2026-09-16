'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/db/client'
import { DomainRuleError } from '@/lib/errors'
import { authActionClient } from '@/lib/safe-action'
import { requireSessionMember } from '@/modules/sessions/data/guards'
import { canSubmitAvailability } from '@/modules/sessions/domain/lifecycle'
import { findSessionState } from '@/modules/sessions/data/session-store'
import { listParticipantRecords } from '@/modules/sessions/data/participants'
import { normalizeRange } from '../domain/ranges'
import { saveAvailabilitySchema, sessionIdSchema } from '../domain/schemas'
import { findPreviousAnswer, saveOwnAvailability } from '../data/availability'
import type { DayRange } from '../domain/types'

export const saveAvailability = authActionClient
  .metadata({ name: 'availability.save' })
  .inputSchema(saveAvailabilitySchema)
  .action(async ({ parsedInput, ctx }) => {
    const context = await requireSessionMember(parsedInput.sessionId)
    const session = await findSessionState(parsedInput.sessionId)

    const open = canSubmitAvailability(session.status)
    if (!open.ok) throw new DomainRuleError(open.error.key)

    if (
      session.availabilityDeadline !== null &&
      session.availabilityDeadline.getTime() <= Date.now()
    ) {
      throw new DomainRuleError('availability.errors.deadlinePassed')
    }

    const participants = await listParticipantRecords(parsedInput.sessionId)
    if (!participants.some((participant) => participant.userId === ctx.user.id)) {
      throw new DomainRuleError('availability.errors.notInvited')
    }

    const allowedDates = new Set(
      parsedInput.ranges
        .map((range) => range.date)
        .filter((date) => date >= session.searchWindowStart && date <= session.searchWindowEnd),
    )

    const ranges: DayRange[] = parsedInput.ranges
      .filter((range) => allowedDates.has(range.date))
      .map((range) => normalizeRange(range, session.gridStartHour, session.gridEndHour))

    const now = new Date()

    await db.transaction(async (tx) => {
      await saveOwnAvailability({
        sessionId: parsedInput.sessionId,
        userId: ctx.user.id,
        ranges,
        now,
        executor: tx,
      })
    })

    revalidatePath(`/sessions/${parsedInput.sessionId}`)
    revalidatePath(`/sessions/${parsedInput.sessionId}/availability`)
    revalidatePath(`/campaigns/${context.campaignId}/sessions`)

    return { savedAt: now }
  })

/** Offers the viewer's answer to the previous session, mapped onto this window. */
export const suggestPreviousAnswer = authActionClient
  .metadata({ name: 'availability.suggestPrevious' })
  .inputSchema(sessionIdSchema)
  .action(async ({ parsedInput, ctx }) => {
    const context = await requireSessionMember(parsedInput.sessionId)
    const session = await findSessionState(parsedInput.sessionId)

    const previous = await findPreviousAnswer({
      sessionId: parsedInput.sessionId,
      campaignId: context.campaignId,
      userId: ctx.user.id,
    })

    if (!previous) return { found: false as const }

    return {
      found: true as const,
      sessionTitle: previous.sessionTitle,
      byWeekday: [...previous.byWeekday.entries()].map(([weekday, range]) => ({
        weekday,
        state: range.state,
        fromHour: range.fromHour,
        toHour: range.toHour,
      })),
      gridStartHour: session.gridStartHour,
      gridEndHour: session.gridEndHour,
    }
  })

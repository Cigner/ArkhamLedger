import { mailer, type MailAttachment } from '@/lib/mail'
import { buildCalendar } from '@/modules/sessions/domain/ics'
import type { DeliveryOutcome, DispatchContext, NotificationDispatcher } from '../domain/dispatcher'

/**
 * Email delivery.
 *
 * Plain text, because every client renders it and every screen reader handles
 * it, and because the content is three sentences and a link.
 *
 * A confirmed or moved session carries a calendar attachment. That is the step
 * that turns "we agreed on Thursday" into an entry with a reminder on it, which
 * is the difference between a date people know about and a date people turn up
 * to.
 */
const CALENDAR_TYPES = new Set(['SESSION_SCHEDULED', 'SESSION_RESCHEDULED', 'SESSION_CANCELLED'])

export const emailDispatcher: NotificationDispatcher = {
  channel: 'EMAIL',

  supports(context: DispatchContext): boolean {
    return context.recipient.email.includes('@')
  },

  async send(context: DispatchContext): Promise<DeliveryOutcome> {
    const attachments = calendarFor(context)

    const result = await mailer().send({
      to: context.recipient.email,
      subject: context.message.subject,
      text: context.message.body,
      ...(attachments ? { attachments } : {}),
    })

    if (result.ok) return { kind: 'SENT', reference: result.messageId }

    return result.retryable
      ? { kind: 'RETRYABLE', error: result.error }
      : { kind: 'PERMANENT', error: result.error }
  },
}

/**
 * The calendar entry for a session whose time is now known.
 *
 * Returns nothing when the payload has no times - a notification that names no
 * date has nothing to put in a calendar, and attaching an empty event would give
 * the reader a broken file instead of none.
 */
function calendarFor(context: DispatchContext): MailAttachment[] | null {
  const { notification } = context
  if (!CALENDAR_TYPES.has(notification.type)) return null
  if (!notification.gameSessionId) return null

  const { startUtc, endUtc } = notification.payload
  if (!startUtc || !endUtc) return null

  const start = new Date(startUtc)
  const end = new Date(endUtc)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null

  const calendar = buildCalendar({
    uid: `session-${notification.gameSessionId}@arkham-ledger`,
    title: notification.payload.sessionTitle ?? 'Session',
    description: notification.payload.campaignName ?? null,
    startUtc: start,
    endUtc: end,
    cancelled: notification.type === 'SESSION_CANCELLED',
    updatedAt: notification.createdAt,
    organizerName: context.campaign?.name ?? 'Arkham Ledger',
    url: notification.payload.url ?? null,
  })

  return [
    { filename: 'session.ics', contentType: 'text/calendar; charset=utf-8', content: calendar },
  ]
}

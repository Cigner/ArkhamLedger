import { formatDeadline, formatWindow } from '@/lib/datetime/format'
import type { NotificationPayload, NotificationType } from './types'

/**
 * What a notification says.
 *
 * One place for the wording, so the same event reads consistently in the
 * application, in an email and in a Discord channel. Payloads carry facts and
 * this turns them into sentences; nothing upstream ever stores a rendered
 * string, because a stored sentence cannot be re-read in another language or
 * another time zone.
 *
 * Two forms, because the audience differs. A person is addressed directly — "you
 * are invited" — while a channel is a room full of people, and a post there
 * saying "you" means nothing. The difference is one line per type and saves
 * every reader a moment of working out who is being spoken to.
 *
 * These strings are deliberately literal rather than catalogue keys. The worker
 * renders them outside any request, where next-intl's server API has no context
 * to resolve against; a translation pass would move them into the catalogue and
 * pass a resolver in, which is a change to this file and to nothing else.
 */
export type RenderedMessage = {
  /** Email subject, and the inbox headline. */
  readonly subject: string
  /** Addressed to the recipient. Plain text: every client and reader handles it. */
  readonly body: string
  /** Addressed to a room. Used by channel dispatchers, never by email. */
  readonly channelText: string
  /** Where the event happened, relative to the application root. */
  readonly href: string | null
}

export type RenderInput = {
  readonly type: NotificationType
  readonly payload: NotificationPayload
  readonly recipientName: string
  /** Absolute origin, so an email can carry a link somebody can actually click. */
  readonly baseUrl: string
  readonly campaignId?: string | null
  readonly gameSessionId?: string | null
}

export function renderNotification(input: RenderInput): RenderedMessage {
  const href = linkFor(input)
  const url = href ? `${input.baseUrl.replace(/\/$/, '')}${href}` : null
  const campaign = input.payload.campaignName ?? 'a campaign'
  const session = input.payload.sessionTitle ?? 'a session'
  const when = formatWhen(input.payload)

  switch (input.type) {
    case 'CAMPAIGN_INVITED':
      return message({
        subject: `You are invited to ${campaign}`,
        body: `${input.payload.actorName ?? 'A Keeper'} has invited you to ${campaign}.`,
        channelText: `${input.payload.actorName ?? 'A Keeper'} invited somebody to ${campaign}.`,
        href,
        url,
      })

    case 'CAMPAIGN_MEMBER_JOINED':
      return message({
        subject: `${input.payload.actorName ?? 'Somebody'} joined ${campaign}`,
        body: `${input.payload.actorName ?? 'Somebody'} has joined ${campaign}.`,
        channelText: `${input.payload.actorName ?? 'Somebody'} has joined ${campaign}.`,
        href,
        url,
      })

    case 'SESSION_CREATED':
      return message({
        subject: `A session is being planned: ${session}`,
        body: `${session} is being planned in ${campaign}.`,
        channelText: `${session} is being planned in ${campaign}.`,
        href,
        url,
      })

    case 'AVAILABILITY_REQUESTED':
      return message({
        subject: `When are you free for ${session}?`,
        body: [`${campaign} is looking for a date for ${session}.`, deadlineSentence(input.payload)]
          .filter(Boolean)
          .join(' '),
        channelText:
          `${campaign} is looking for a date for ${session}. ${deadlineSentence(input.payload)}`.trim(),
        href,
        url,
      })

    case 'AVAILABILITY_REMINDER':
      return message({
        subject: `Still waiting on you for ${session}`,
        body: [
          `You have not said when you are free for ${session}.`,
          deadlineSentence(input.payload),
        ]
          .filter(Boolean)
          .join(' '),
        channelText:
          `Some answers are still missing for ${session}. ${deadlineSentence(input.payload)}`.trim(),
        href,
        url,
      })

    case 'COLLECTION_CLOSED':
      return message({
        subject: `Answers are in for ${session}`,
        body: `The deadline for ${session} has passed and the possible dates have been worked out. Pick one when you have a moment.`,
        channelText: `Answers are in for ${session}; the Keeper is choosing a date.`,
        href,
        url,
      })

    case 'SESSION_SCHEDULED':
      return message({
        subject: `${session} is confirmed${when ? ` — ${when}` : ''}`,
        body: `${session} will run ${when ?? 'at the agreed time'}.`,
        channelText: `${session} is confirmed: ${when ?? 'time to be announced'}.`,
        href,
        url,
      })

    case 'SESSION_RESCHEDULED':
      return message({
        subject: `${session} has moved${when ? ` — ${when}` : ''}`,
        body: `${session} has been moved. It will now run ${when ?? 'at a new time'}.`,
        channelText: `${session} has moved: ${when ?? 'new time to be announced'}.`,
        href,
        url,
      })

    case 'SESSION_CANCELLED':
      return message({
        subject: `${session} is cancelled`,
        body: [`${session} will not be running.`, reasonSentence(input.payload)]
          .filter(Boolean)
          .join(' '),
        channelText: [`${session} is cancelled.`, reasonSentence(input.payload)]
          .filter(Boolean)
          .join(' '),
        href,
        url,
      })

    case 'NO_NEXT_SESSION':
      return message({
        subject: `${campaign} has no next session`,
        body: `Nothing is scheduled in ${campaign}. Campaigns end this way more often than they end badly.`,
        channelText: `Nothing is scheduled in ${campaign}.`,
        href,
        url,
      })
  }
}

/**
 * Appends the link to the body.
 *
 * Done once here rather than in every branch: an email whose point is "go and
 * answer" is useless without the address, and forgetting it in one branch out of
 * nine is exactly the kind of omission nobody notices until that one type fires.
 */
function message(input: {
  subject: string
  body: string
  channelText: string
  href: string | null
  url: string | null
}): RenderedMessage {
  return {
    subject: input.subject,
    body: input.url ? `${input.body}\n\n${input.url}` : input.body,
    channelText: input.url ? `${input.channelText}\n${input.url}` : input.channelText,
    href: input.href,
  }
}

function linkFor(input: RenderInput): string | null {
  if (input.type === 'AVAILABILITY_REQUESTED' || input.type === 'AVAILABILITY_REMINDER') {
    return input.gameSessionId ? `/sessions/${input.gameSessionId}/availability` : null
  }
  // The Keeper's next action is choosing, so the link goes where the list is.
  if (input.type === 'COLLECTION_CLOSED') {
    return input.gameSessionId ? `/sessions/${input.gameSessionId}/scheduling` : null
  }
  if (input.gameSessionId) return `/sessions/${input.gameSessionId}`
  if (input.campaignId) return `/campaigns/${input.campaignId}`
  return null
}

function formatWhen(payload: NotificationPayload): string | null {
  if (!payload.startUtc || !payload.endUtc) return null

  const start = new Date(payload.startUtc)
  const end = new Date(payload.endUtc)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null

  const zone = payload.timezone ?? 'UTC'
  return `${formatWindow(start, end, zone)} (${zone})`
}

function deadlineSentence(payload: NotificationPayload): string {
  if (!payload.deadlineUtc) return ''

  const deadline = new Date(payload.deadlineUtc)
  if (Number.isNaN(deadline.getTime())) return ''

  // Stored as the instant the day ends, so it is rendered as that day.
  return `Answer by ${formatDeadline(deadline, payload.timezone ?? 'UTC')}.`
}

function reasonSentence(payload: NotificationPayload): string {
  return payload.reason ? `Reason: ${payload.reason}` : ''
}

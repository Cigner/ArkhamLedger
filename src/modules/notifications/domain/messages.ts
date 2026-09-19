import { formatDeadline, formatWindow } from '@/lib/datetime/format'
import type { AppTranslator } from '@/lib/i18n/translator'
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
 * Two forms, because the audience differs. A person is addressed directly - "you
 * are invited" - while a channel is a room full of people, and a post there
 * saying "you" means nothing. The difference is one line per type and saves
 * every reader a moment of working out who is being spoken to.
 *
 * A translator is injected because workers render outside a request context.
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
  readonly translate: AppTranslator
}

export function renderNotification(input: RenderInput): RenderedMessage {
  const href = linkFor(input)
  const t = input.translate
  const url = href ? `${input.baseUrl.replace(/\/$/, '')}${href}` : null
  const campaign = input.payload.campaignName ?? t('notifications.messages.fallback.campaign')
  const session = input.payload.sessionTitle ?? t('notifications.messages.fallback.session')
  const investigator =
    input.payload.investigatorName ?? t('notifications.messages.fallback.investigator')
  const when = formatWhen(input.payload)

  switch (input.type) {
    case 'CAMPAIGN_INVITED':
      return message({
        subject: t('notifications.messages.campaignInvited.subject', { campaign }),
        body: t('notifications.messages.campaignInvited.body', {
          actor: input.payload.actorName ?? t('notifications.messages.fallback.keeper'),
          campaign,
        }),
        channelText: t('notifications.messages.campaignInvited.channel', {
          actor: input.payload.actorName ?? t('notifications.messages.fallback.keeper'),
          campaign,
        }),
        href,
        url,
      })

    case 'CAMPAIGN_MEMBER_JOINED':
      return message({
        subject: t('notifications.messages.memberJoined.subject', {
          actor: input.payload.actorName ?? t('notifications.messages.fallback.somebody'),
          campaign,
        }),
        body: t('notifications.messages.memberJoined.body', {
          actor: input.payload.actorName ?? t('notifications.messages.fallback.somebody'),
          campaign,
        }),
        channelText: t('notifications.messages.memberJoined.channel', {
          actor: input.payload.actorName ?? t('notifications.messages.fallback.somebody'),
          campaign,
        }),
        href,
        url,
      })

    case 'SESSION_CREATED':
      return message({
        subject: t('notifications.messages.sessionCreated.subject', { session }),
        body: t('notifications.messages.sessionCreated.body', { session, campaign }),
        channelText: t('notifications.messages.sessionCreated.channel', { session, campaign }),
        href,
        url,
      })

    case 'AVAILABILITY_REQUESTED':
      return message({
        subject: t('notifications.messages.availabilityRequested.subject', { session }),
        body: [
          t('notifications.messages.availabilityRequested.body', { campaign, session }),
          deadlineSentence(input.payload, t),
        ]
          .filter(Boolean)
          .join(' '),
        channelText:
          `${t('notifications.messages.availabilityRequested.channel', { campaign, session })} ${deadlineSentence(input.payload, t)}`.trim(),
        href,
        url,
      })

    case 'AVAILABILITY_REMINDER':
      return message({
        subject: t('notifications.messages.availabilityReminder.subject', { session }),
        body: [
          t('notifications.messages.availabilityReminder.body', { session }),
          deadlineSentence(input.payload, t),
        ]
          .filter(Boolean)
          .join(' '),
        channelText:
          `${t('notifications.messages.availabilityReminder.channel', { session })} ${deadlineSentence(input.payload, t)}`.trim(),
        href,
        url,
      })

    case 'COLLECTION_CLOSED':
      return message({
        subject: t('notifications.messages.collectionClosed.subject', { session }),
        body: t('notifications.messages.collectionClosed.body', { session }),
        channelText: t('notifications.messages.collectionClosed.channel', { session }),
        href,
        url,
      })

    case 'SESSION_SCHEDULED':
      return message({
        subject: t('notifications.messages.scheduled.subject', {
          session,
          suffix: when ? ` - ${when}` : '',
        }),
        body: t('notifications.messages.scheduled.body', {
          session,
          when: when ?? t('notifications.messages.fallback.agreedTime'),
        }),
        channelText: t('notifications.messages.scheduled.channel', {
          session,
          when: when ?? t('notifications.messages.fallback.timeTba'),
        }),
        href,
        url,
      })

    case 'SESSION_RESCHEDULED':
      return message({
        subject: t('notifications.messages.rescheduled.subject', {
          session,
          suffix: when ? ` - ${when}` : '',
        }),
        body: t('notifications.messages.rescheduled.body', {
          session,
          when: when ?? t('notifications.messages.fallback.newTime'),
        }),
        channelText: t('notifications.messages.rescheduled.channel', {
          session,
          when: when ?? t('notifications.messages.fallback.newTimeTba'),
        }),
        href,
        url,
      })

    case 'SESSION_CANCELLED':
      return message({
        subject: t('notifications.messages.cancelled.subject', { session }),
        body: [
          t('notifications.messages.cancelled.body', { session }),
          reasonSentence(input.payload, t),
        ]
          .filter(Boolean)
          .join(' '),
        channelText: [
          t('notifications.messages.cancelled.channel', { session }),
          reasonSentence(input.payload, t),
        ]
          .filter(Boolean)
          .join(' '),
        href,
        url,
      })

    case 'NO_NEXT_SESSION':
      return message({
        subject: t('notifications.messages.noNext.subject', { campaign }),
        body: t('notifications.messages.noNext.body', { campaign }),
        channelText: t('notifications.messages.noNext.channel', { campaign }),
        href,
        url,
      })

    case 'ISSUE_REPORTED':
      return message({
        subject: t('notifications.messages.issue.subject', {
          actor: input.payload.actorName ?? t('notifications.messages.fallback.userLower'),
        }),
        body: [
          t('notifications.messages.issue.body', {
            actor: input.payload.actorName ?? t('notifications.messages.fallback.user'),
            email: input.payload.reporterEmail ?? t('notifications.messages.fallback.noEmail'),
          }),
          input.payload.sourcePath
            ? t('notifications.messages.issue.page', { path: input.payload.sourcePath })
            : '',
          input.payload.reportMessage ?? '',
        ]
          .filter(Boolean)
          .join('\n\n'),
        channelText: t('notifications.messages.issue.channel'),
        href,
        url,
      })

    case 'INVESTIGATOR_CREATED_FOR_YOU':
      return message({
        subject: t('notifications.messages.investigatorCreated.subject', { investigator }),
        body: t('notifications.messages.investigatorCreated.body', {
          actor: input.payload.actorName ?? t('notifications.messages.fallback.keeper'),
          investigator,
          campaign,
        }),
        channelText: t('notifications.messages.investigatorGeneric.channel', { campaign }),
        href,
        url,
      })

    case 'INVESTIGATOR_LINKED':
      return message({
        subject: t('notifications.messages.investigatorLinked.subject', { investigator }),
        body: t('notifications.messages.investigatorLinked.body', { investigator, campaign }),
        channelText: t('notifications.messages.investigatorGeneric.channel', { campaign }),
        href,
        url,
      })

    case 'INVESTIGATOR_REQUESTED':
      return message({
        subject: t('notifications.messages.investigatorRequested.subject', { campaign }),
        body: t('notifications.messages.investigatorRequested.body', {
          actor: input.payload.actorName ?? t('notifications.messages.fallback.keeper'),
          investigator,
          campaign,
        }),
        channelText: t('notifications.messages.investigatorGeneric.channel', { campaign }),
        href,
        url,
      })

    case 'INVESTIGATOR_EDIT_GRANT_CLOSED':
      return message({
        subject: t('notifications.messages.editGrantClosed.subject', { investigator }),
        body: t('notifications.messages.editGrantClosed.body', { investigator }),
        channelText: t('notifications.messages.investigatorGeneric.channel', { campaign }),
        href,
        url,
      })

    case 'INVESTIGATOR_TRANSFER_REQUESTED':
      return message({
        subject: t('notifications.messages.transferRequested.subject', { investigator }),
        body: t('notifications.messages.transferRequested.body', {
          actor: input.payload.actorName ?? t('notifications.messages.fallback.keeper'),
          investigator,
          campaign,
        }),
        channelText: t('notifications.messages.investigatorGeneric.channel', { campaign }),
        href,
        url,
      })

    case 'INVESTIGATOR_TRANSFER_ACCEPTED':
      return message({
        subject: t('notifications.messages.transferAccepted.subject', { investigator }),
        body: t('notifications.messages.transferAccepted.body', { investigator, campaign }),
        channelText: t('notifications.messages.investigatorGeneric.channel', { campaign }),
        href,
        url,
      })

    case 'INVESTIGATOR_TRANSFER_REJECTED':
      return message({
        subject: t('notifications.messages.transferRejected.subject', { investigator }),
        body: [
          t('notifications.messages.transferRejected.body', { investigator, campaign }),
          reasonSentence(input.payload, t),
        ]
          .filter(Boolean)
          .join(' '),
        channelText: t('notifications.messages.investigatorGeneric.channel', { campaign }),
        href,
        url,
      })

    case 'INVESTIGATOR_TRANSFER_EXPIRED':
      return message({
        subject: t('notifications.messages.transferExpired.subject', { investigator }),
        body: t('notifications.messages.transferExpired.body', { investigator, campaign }),
        channelText: t('notifications.messages.investigatorGeneric.channel', { campaign }),
        href,
        url,
      })

    case 'SESSION_ASSIGNMENT_CHANGED':
      return message({
        subject: t('notifications.messages.assignmentChanged.subject', { session }),
        body: t('notifications.messages.assignmentChanged.body', { investigator, session }),
        channelText: t('notifications.messages.investigatorGeneric.channel', { campaign }),
        href,
        url,
      })

    case 'SESSION_ASSIGNMENT_MISSING':
      return message({
        subject: t('notifications.messages.assignmentMissing.subject', { session }),
        body: t('notifications.messages.assignmentMissing.body', {
          players: input.payload.players ?? t('notifications.messages.fallback.somebody'),
          session,
        }),
        channelText: t('notifications.messages.investigatorGeneric.channel', { campaign }),
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

const INVESTIGATOR_LINKED_TYPES: readonly NotificationType[] = [
  'INVESTIGATOR_CREATED_FOR_YOU',
  'INVESTIGATOR_LINKED',
  'INVESTIGATOR_REQUESTED',
  'INVESTIGATOR_EDIT_GRANT_CLOSED',
  'INVESTIGATOR_TRANSFER_REQUESTED',
  'INVESTIGATOR_TRANSFER_ACCEPTED',
  'INVESTIGATOR_TRANSFER_REJECTED',
  'INVESTIGATOR_TRANSFER_EXPIRED',
]

function linkFor(input: RenderInput): string | null {
  if (input.type === 'ISSUE_REPORTED') return '/admin/reports'
  if (INVESTIGATOR_LINKED_TYPES.includes(input.type) && input.payload.investigatorId) {
    return `/investigators/${input.payload.investigatorId}`
  }
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

function deadlineSentence(payload: NotificationPayload, t: AppTranslator): string {
  if (!payload.deadlineUtc) return ''

  const deadline = new Date(payload.deadlineUtc)
  if (Number.isNaN(deadline.getTime())) return ''

  // Stored as the instant the day ends, so it is rendered as that day.
  return t('notifications.messages.deadline', {
    deadline: formatDeadline(deadline, payload.timezone ?? 'UTC'),
  })
}

function reasonSentence(payload: NotificationPayload, t: AppTranslator): string {
  return payload.reason ? t('notifications.messages.reason', { reason: payload.reason }) : ''
}

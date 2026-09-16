/**
 * Notification model.
 *
 * A notification is an event that happened to somebody, stored once, and
 * delivered through zero or more channels. The split matters: the record is the
 * thing a person can come back and read, and delivery is a best effort on top of
 * it that may fail, retry, or be switched off entirely.
 *
 * Payloads carry facts, never sentences. Rendering happens at the edge - see
 * messages.ts - so the same stored event can be read in the application, in an
 * email, and in a Discord channel without three copies of the wording.
 */
export type NotificationType =
  | 'CAMPAIGN_INVITED'
  | 'CAMPAIGN_MEMBER_JOINED'
  | 'SESSION_CREATED'
  | 'AVAILABILITY_REQUESTED'
  | 'AVAILABILITY_REMINDER'
  | 'COLLECTION_CLOSED'
  | 'SESSION_SCHEDULED'
  | 'SESSION_RESCHEDULED'
  | 'SESSION_CANCELLED'
  | 'NO_NEXT_SESSION'
  | 'ISSUE_REPORTED'

export type DeliveryChannel = 'IN_APP' | 'EMAIL' | 'DISCORD'
export type DeliveryStatus = 'PENDING' | 'SENDING' | 'SENT' | 'FAILED'

/**
 * What a notification is about.
 *
 * One shape for every type rather than a union per type: the fields are all
 * optional facts about the same three nouns, and a union here would force every
 * caller and every renderer through a discriminated switch for no gain in
 * safety - the renderer already switches on the type.
 */
export type NotificationPayload = {
  readonly campaignName?: string
  readonly sessionTitle?: string
  /** Who caused this, when that is the point of the message. */
  readonly actorName?: string
  /** ISO instants; rendered in the reader's zone, never stored pre-formatted. */
  readonly startUtc?: string
  readonly endUtc?: string
  readonly timezone?: string
  readonly deadlineUtc?: string
  readonly reason?: string
  readonly url?: string
  readonly reportId?: string
  readonly reportMessage?: string
  readonly reporterEmail?: string
  readonly sourcePath?: string
}

export type NotificationRecord = {
  readonly id: string
  readonly userId: string
  readonly type: NotificationType
  readonly campaignId: string | null
  readonly gameSessionId: string | null
  readonly payload: NotificationPayload
  readonly readAt: Date | null
  readonly createdAt: Date
}

/** What a person sees in their inbox, already rendered. */
export type InboxItem = {
  readonly id: string
  readonly type: NotificationType
  readonly title: string
  readonly body: string
  readonly href: string | null
  readonly readAt: Date | null
  readonly createdAt: Date
}

/**
 * One notification to write, with the channels it should go out on.
 *
 * Assembled by the caller inside its own transaction: the event and the
 * intention to deliver it are written together or not at all.
 */
export type NotificationDraft = {
  readonly userId: string
  readonly type: NotificationType
  readonly campaignId?: string | null
  readonly gameSessionId?: string | null
  readonly payload: NotificationPayload
  /** Operational channels that cannot be disabled by recipient preferences. */
  readonly requiredChannels?: readonly DeliveryChannel[]
}

export type Recipient = {
  readonly userId: string
  readonly name: string
  readonly email: string
  readonly timezone: string
}

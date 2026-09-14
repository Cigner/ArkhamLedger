import type { DeliveryChannel, NotificationType } from './types'

/**
 * Which channels an event goes out on.
 *
 * Three rules, each with a reason somebody will eventually ask about:
 *
 *   - In-app is not optional. The row is the record of the event; switching it
 *     off would leave a person with no way to find out what happened, only a
 *     quieter inbox.
 *   - Email is on unless the person turned it off. A default of "off" reads as
 *     working software that never tells anybody anything.
 *   - Discord carries campaign-level facts only, and only once per event. A
 *     channel is a room, not an inbox: five people being told the date is
 *     confirmed should be one post, and "you have not answered yet" should not
 *     be posted to the room at all.
 */
export const ALWAYS_ON_CHANNELS: readonly DeliveryChannel[] = ['IN_APP']

export const CHANNEL_DEFAULT_ENABLED: Readonly<Record<DeliveryChannel, boolean>> = {
  IN_APP: true,
  EMAIL: true,
  DISCORD: true,
}

/** Channels a person may switch off for themselves. */
export const CONFIGURABLE_CHANNELS: readonly DeliveryChannel[] = ['EMAIL']

/**
 * Events a campaign's channel should hear about.
 *
 * Everything here is a fact about the campaign that the whole table shares. What
 * is missing is deliberate: invitations are private, and a reminder addressed to
 * one person becomes noise the moment it is read by everybody.
 */
export const BROADCAST_TYPES: readonly NotificationType[] = [
  'AVAILABILITY_REQUESTED',
  'SESSION_SCHEDULED',
  'SESSION_RESCHEDULED',
  'SESSION_CANCELLED',
  'CAMPAIGN_MEMBER_JOINED',
  'NO_NEXT_SESSION',
]

export function isBroadcast(type: NotificationType): boolean {
  return BROADCAST_TYPES.includes(type)
}

export function channelsFor(input: {
  readonly type: NotificationType
  /** Only the exceptions are stored; anything absent takes the default. */
  readonly disabledChannels: ReadonlySet<DeliveryChannel>
  readonly campaignHasWebhook: boolean
  /**
   * Whether this copy of the event is the one that posts to the channel. Exactly
   * one recipient carries it, so a session confirmed for six people is one post.
   */
  readonly carriesBroadcast: boolean
}): DeliveryChannel[] {
  const channels: DeliveryChannel[] = [...ALWAYS_ON_CHANNELS]

  if (!input.disabledChannels.has('EMAIL')) channels.push('EMAIL')

  /*
   * Not gated on the carrier's own preferences: the post belongs to the campaign,
   * not to whichever recipient happens to be carrying it, and one person muting
   * their email should not silence the room.
   */
  if (input.carriesBroadcast && input.campaignHasWebhook && isBroadcast(input.type)) {
    channels.push('DISCORD')
  }

  return channels
}

import { describe, expect, it } from 'vitest'
import { MAX_DELIVERY_ATTEMPTS, nextAttemptAfter } from '@/modules/notifications/domain/backoff'
import { channelsFor, isBroadcast } from '@/modules/notifications/domain/preferences'
import type { DeliveryChannel } from '@/modules/notifications/domain/types'

/**
 * How and whether something is delivered.
 *
 * The rules that decide who hears about an event, and how patiently the queue
 * retries when the answer is "by email" and the relay is down.
 */
const NOW = new Date('2026-09-14T12:00:00Z')

describe('retrying', () => {
  it('waits longer after each failure', () => {
    const delays = [1, 2, 3, 4].map((attempts) => {
      const next = nextAttemptAfter(attempts, NOW)
      return next ? next.getTime() - NOW.getTime() : null
    })

    expect(delays.every((delay) => delay !== null)).toBe(true)
    expect(delays).toEqual([...delays].sort((a, b) => (a ?? 0) - (b ?? 0)))
  })

  /*
   * Stopping matters as much as retrying. A delivery that never gives up keeps a
   * dead address in the queue forever, and the FAILED state is the only evidence
   * an administrator has that somebody was never told.
   */
  it('gives up once the attempts are spent', () => {
    expect(nextAttemptAfter(MAX_DELIVERY_ATTEMPTS, NOW)).toBeNull()
    expect(nextAttemptAfter(MAX_DELIVERY_ATTEMPTS + 1, NOW)).toBeNull()
  })

  it('covers a few hours in total, which is a restart or a short outage', () => {
    const last = nextAttemptAfter(MAX_DELIVERY_ATTEMPTS - 1, NOW)
    const hours = last ? (last.getTime() - NOW.getTime()) / 3_600_000 : 0

    expect(hours).toBeGreaterThanOrEqual(1)
    expect(hours).toBeLessThanOrEqual(6)
  })
})

describe('which channels an event goes out on', () => {
  const base = {
    type: 'SESSION_SCHEDULED' as const,
    disabledChannels: new Set<DeliveryChannel>(),
    campaignHasWebhook: true,
    carriesBroadcast: true,
  }

  it('always records it in the application', () => {
    expect(channelsFor({ ...base, disabledChannels: new Set(['EMAIL'] as const) })).toContain(
      'IN_APP',
    )
  })

  it('emails unless the person turned it off', () => {
    expect(channelsFor(base)).toContain('EMAIL')
    expect(channelsFor({ ...base, disabledChannels: new Set(['EMAIL'] as const) })).not.toContain(
      'EMAIL',
    )
  })

  /*
   * One post per event, not one per recipient: six people being told a date is
   * confirmed is one thing that happened, and a channel should say it once.
   */
  it('posts to Discord only from the copy carrying the broadcast', () => {
    expect(channelsFor(base)).toContain('DISCORD')
    expect(channelsFor({ ...base, carriesBroadcast: false })).not.toContain('DISCORD')
  })

  it('posts nothing to a campaign with no webhook', () => {
    expect(channelsFor({ ...base, campaignHasWebhook: false })).not.toContain('DISCORD')
  })

  it('keeps personal nudges out of the channel', () => {
    expect(isBroadcast('AVAILABILITY_REMINDER')).toBe(false)
    expect(channelsFor({ ...base, type: 'AVAILABILITY_REMINDER' })).not.toContain('DISCORD')
  })

  it('keeps invitations out of the channel', () => {
    expect(isBroadcast('CAMPAIGN_INVITED')).toBe(false)
  })

  /*
   * The post belongs to the campaign rather than to whoever happens to carry it,
   * so one person muting their own email must not silence the room.
   */
  it('posts to the channel even when the carrier has muted their email', () => {
    expect(
      channelsFor({ ...base, disabledChannels: new Set(['EMAIL'] as const) }),
    ).toContain('DISCORD')
  })
})

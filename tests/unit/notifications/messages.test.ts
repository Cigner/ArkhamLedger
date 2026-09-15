import { describe, expect, it } from 'vitest'
import { renderNotification } from '@/modules/notifications/domain/messages'
import type { NotificationType } from '@/modules/notifications/domain/types'

/**
 * Notification wording.
 *
 * Checked because these strings are the whole product to somebody who only ever
 * reads the email. Two properties matter more than any individual sentence: a
 * message addressed to a person never appears in a channel unchanged, and every
 * message that asks for an action carries the address of that action.
 */
const BASE = {
  recipientName: 'Anna',
  baseUrl: 'https://arkham.test',
  campaignId: '01H00000000000000000000001',
  gameSessionId: '01H00000000000000000000002',
}

const ALL_TYPES: NotificationType[] = [
  'CAMPAIGN_INVITED',
  'CAMPAIGN_MEMBER_JOINED',
  'SESSION_CREATED',
  'AVAILABILITY_REQUESTED',
  'AVAILABILITY_REMINDER',
  'COLLECTION_CLOSED',
  'SESSION_SCHEDULED',
  'SESSION_RESCHEDULED',
  'SESSION_CANCELLED',
  'NO_NEXT_SESSION',
]

describe('every type', () => {
  it.each(ALL_TYPES)('says something for %s', (type) => {
    const rendered = renderNotification({
      ...BASE,
      type,
      payload: { campaignName: 'Masks of Nyarlathotep', sessionTitle: 'Chapter Two' },
    })

    expect(rendered.subject.length).toBeGreaterThan(5)
    expect(rendered.body.length).toBeGreaterThan(10)
    expect(rendered.channelText.length).toBeGreaterThan(5)
  })

  /*
   * A channel is a room. "You have not answered" posted there is addressed to
   * nobody and read by everybody, which is how a group learns to ignore the bot.
   */
  it.each(ALL_TYPES)('never addresses a room as a person for %s', (type) => {
    const rendered = renderNotification({
      ...BASE,
      type,
      payload: { campaignName: 'Masks', sessionTitle: 'Chapter Two' },
    })

    expect(rendered.channelText.toLowerCase()).not.toMatch(/\byou\b|\byour\b/)
  })

  it.each(ALL_TYPES)('carries a link somebody can act on for %s', (type) => {
    const rendered = renderNotification({
      ...BASE,
      type,
      payload: { campaignName: 'Masks', sessionTitle: 'Chapter Two' },
    })

    expect(rendered.body).toContain('https://arkham.test/')
    expect(rendered.href).not.toBeNull()
  })
})

describe('where a message points', () => {
  it('sends a request for availability to the grid, not to the overview', () => {
    const rendered = renderNotification({ ...BASE, type: 'AVAILABILITY_REQUESTED', payload: {} })

    expect(rendered.href).toBe(`/sessions/${BASE.gameSessionId}/availability`)
  })

  it('sends a closed deadline to the list of dates', () => {
    const rendered = renderNotification({ ...BASE, type: 'COLLECTION_CLOSED', payload: {} })

    expect(rendered.href).toBe(`/sessions/${BASE.gameSessionId}/scheduling`)
  })

  it('falls back to the campaign when there is no session', () => {
    const rendered = renderNotification({
      ...BASE,
      gameSessionId: null,
      type: 'CAMPAIGN_INVITED',
      payload: {},
    })

    expect(rendered.href).toBe(`/campaigns/${BASE.campaignId}`)
  })
})

describe('times in a message', () => {
  it('states the window and the zone it is in', () => {
    const rendered = renderNotification({
      ...BASE,
      type: 'SESSION_SCHEDULED',
      payload: {
        sessionTitle: 'Chapter Two',
        startUtc: '2026-10-08T16:00:00Z',
        endUtc: '2026-10-08T22:00:00Z',
        timezone: 'Europe/Warsaw',
      },
    })

    expect(rendered.subject).toContain('Thursday 8 October, 18:00 – 24:00')
    expect(rendered.body).toContain('Europe/Warsaw')
  })

  /*
   * A payload written before a date existed, or one that lost its times to a
   * migration, must still produce a sentence. An email reading "will run
   * undefined" is worse than one that is merely vague.
   */
  it('still reads as a sentence when the times are missing', () => {
    const rendered = renderNotification({
      ...BASE,
      type: 'SESSION_SCHEDULED',
      payload: { sessionTitle: 'Chapter Two' },
    })

    expect(rendered.body).not.toContain('undefined')
    expect(rendered.body).toContain('Chapter Two')
  })

  it('ignores a time it cannot parse rather than printing it', () => {
    const rendered = renderNotification({
      ...BASE,
      type: 'SESSION_SCHEDULED',
      payload: { sessionTitle: 'Chapter Two', startUtc: 'not a date', endUtc: 'nor this' },
    })

    expect(rendered.body).not.toContain('Invalid')
  })

  /*
   * A deadline is stored as the instant its day ends — midnight opening the
   * next one — so naming it means naming the day before that instant.
   */
  it('names the last day to answer, not the midnight that ends it', () => {
    const rendered = renderNotification({
      ...BASE,
      type: 'AVAILABILITY_REQUESTED',
      payload: {
        sessionTitle: 'Chapter Two',
        deadlineUtc: '2026-10-04T22:00:00Z',
        timezone: 'Europe/Warsaw',
      },
    })

    expect(rendered.body).toContain('Answer by Sunday 4 October')
  })
})

describe('a cancellation', () => {
  it('carries the reason, which is the only part anybody reads twice', () => {
    const rendered = renderNotification({
      ...BASE,
      type: 'SESSION_CANCELLED',
      payload: { sessionTitle: 'Chapter Two', reason: 'Half the table has the flu' },
    })

    expect(rendered.body).toContain('Half the table has the flu')
    expect(rendered.channelText).toContain('Half the table has the flu')
  })
})

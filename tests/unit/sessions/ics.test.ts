import { describe, expect, it } from 'vitest'
import { buildCalendar, type CalendarEvent } from '@/modules/sessions/domain/ics'

/**
 * Calendar export.
 *
 * A malformed file does not produce an error a user can act on — the calendar
 * silently declines to import it — so the parts of RFC 5545 that are easy to get
 * wrong are pinned here rather than checked by eye.
 */
const BASE: CalendarEvent = {
  uid: 'session-01H0000000000000000000000@arkham',
  title: 'The Corbitt House',
  description: 'Bring the ledger.',
  startUtc: new Date('2026-10-08T16:00:00Z'),
  endUtc: new Date('2026-10-08T22:00:00Z'),
  cancelled: false,
  updatedAt: new Date('2026-09-14T12:00:00Z'),
  organizerName: 'Eleanor Ashcroft',
  url: 'https://arkham.test/sessions/abc',
}

function lines(event: CalendarEvent = BASE): string[] {
  return buildCalendar(event).split('\r\n')
}

describe('the envelope', () => {
  it('ends every line with CRLF, including the last', () => {
    expect(buildCalendar(BASE).endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(buildCalendar(BASE)).not.toMatch(/[^\r]\n/)
  })

  it('carries the fields a client needs to place the event', () => {
    expect(lines()).toEqual(
      expect.arrayContaining([
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'DTSTART:20261008T160000Z',
        'DTEND:20261008T220000Z',
        'STATUS:CONFIRMED',
        'SUMMARY:The Corbitt House',
        'END:VCALENDAR',
      ]),
    )
  })

  /*
   * The same UID is what makes a moved session replace the old entry rather than
   * appear beside it, which is the difference between a useful export and two
   * conflicting entries in somebody's evening.
   */
  it('keeps the identifier stable and raises the sequence on an update', () => {
    const moved = buildCalendar({
      ...BASE,
      startUtc: new Date('2026-10-09T16:00:00Z'),
      updatedAt: new Date('2026-09-15T12:00:00Z'),
    })

    expect(moved).toContain(`UID:${BASE.uid}`)
    expect(sequenceOf(moved)).toBeGreaterThan(sequenceOf(buildCalendar(BASE)))
  })

  it('cancels rather than deletes', () => {
    const cancelled = buildCalendar({ ...BASE, cancelled: true })

    expect(cancelled).toContain('METHOD:CANCEL')
    expect(cancelled).toContain('STATUS:CANCELLED')
  })
})

describe('escaping', () => {
  it('escapes the characters that would end a property early', () => {
    const escaped = buildCalendar({
      ...BASE,
      title: 'Chapter one, part two; or: what happened',
    })

    expect(escaped).toContain('SUMMARY:Chapter one\\, part two\; or: what happened')
  })

  it('turns a newline into its escape rather than a new property', () => {
    const escaped = buildCalendar({ ...BASE, description: 'First line\nSecond line' })

    expect(escaped).toContain('DESCRIPTION:First line\\nSecond line')
    expect(escaped.split('\r\n').some((line) => line === 'Second line')).toBe(false)
  })

  it('escapes a backslash without doubling the escapes it introduced', () => {
    expect(buildCalendar({ ...BASE, title: 'A\\B,C' })).toContain('SUMMARY:A\\\\B\\,C')
  })
})

describe('folding', () => {
  it('folds a long line and marks the continuation with a space', () => {
    const folded = lines({ ...BASE, title: 'x'.repeat(200) })
    const continuation = folded.filter((line) => line.startsWith(' '))

    expect(continuation.length).toBeGreaterThan(0)
    expect(folded.every((line) => Buffer.from(line, 'utf8').length <= 75)).toBe(true)
  })

  /*
   * Counting characters instead of octets splits a two-byte character in half,
   * and the name arrives as replacement marks. Polish names make this reachable
   * rather than theoretical.
   */
  it('never splits a multi-byte character', () => {
    const folded = buildCalendar({ ...BASE, title: 'Józef'.repeat(40) })

    expect(folded).not.toContain('�')
    expect(folded.split('\r\n').every((line) => Buffer.from(line, 'utf8').length <= 75)).toBe(true)
  })
})

function sequenceOf(calendar: string): number {
  const match = /SEQUENCE:(\d+)/.exec(calendar)
  return Number(match?.[1] ?? 0)
}

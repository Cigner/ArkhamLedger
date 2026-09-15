import { describe, expect, it } from 'vitest'
import {
  deadlineToLocalDate,
  formatDeadline,
  formatWindow,
  hoursBetween,
} from '@/lib/datetime/format'

/**
 * Formatting a window.
 *
 * One rule, applied everywhere a session's time is printed: the zone decides the
 * clock, and an evening that runs until midnight says so.
 */
const ZONE = 'Europe/Warsaw'

describe('formatWindow', () => {
  it('prints the day and the hours in the session’s zone', () => {
    expect(
      formatWindow(new Date('2026-10-08T16:00:00Z'), new Date('2026-10-08T20:00:00Z'), ZONE),
    ).toBe('Thursday 8 October, 18:00 – 22:00')
  })

  /*
   * The bug this exists to prevent: midnight printed as 00:00 reads as ending
   * twelve hours before the session began.
   */
  it('prints an evening that runs to midnight as ending at 24:00', () => {
    expect(
      formatWindow(new Date('2026-10-08T16:00:00Z'), new Date('2026-10-08T22:00:00Z'), ZONE),
    ).toBe('Thursday 8 October, 18:00 – 24:00')
  })

  it('keeps a start at midnight as 00:00, which is where it belongs', () => {
    expect(
      formatWindow(new Date('2026-10-07T22:00:00Z'), new Date('2026-10-08T04:00:00Z'), ZONE),
    ).toBe('Thursday 8 October, 00:00 – 06:00')
  })

  it('reads the clock in the given zone, not in UTC', () => {
    expect(
      formatWindow(new Date('2026-10-08T16:00:00Z'), new Date('2026-10-08T20:00:00Z'), 'UTC'),
    ).toBe('Thursday 8 October, 16:00 – 20:00')
  })
})

describe('hoursBetween', () => {
  it('counts real hours, so a night with a clock change is not 24 long', () => {
    // Poland, the night the clocks go back: local midnight to local six is seven hours.
    expect(hoursBetween(new Date('2026-10-24T22:00:00Z'), new Date('2026-10-25T05:00:00Z'))).toBe(7)
  })
})

describe('formatDeadline', () => {
  /*
   * A deadline is stored as the instant its day ends, so formatting the instant
   * directly names the following day at midnight — a date nobody chose and a
   * time nobody was offered.
   */
  it('names the day the deadline runs to the end of', () => {
    expect(formatDeadline(new Date('2026-10-04T22:00:00Z'), ZONE)).toBe('Sunday 4 October')
  })

  it('reads the day back for a form exactly as it was entered', () => {
    expect(deadlineToLocalDate(new Date('2026-10-04T22:00:00Z'), ZONE)).toBe('2026-10-04')
  })

  /*
   * The night the clocks go back has a 25-hour day, so its end is not 24 hours
   * after its start. Both functions work from the instant, which is why neither
   * has to know that.
   */
  it('holds on the night a local day is 25 hours long', () => {
    // Europe/Warsaw, 25 October 2026 ends at 23:00 UTC rather than 22:00.
    expect(formatDeadline(new Date('2026-10-25T23:00:00Z'), ZONE)).toBe('Sunday 25 October')
    expect(deadlineToLocalDate(new Date('2026-10-25T23:00:00Z'), ZONE)).toBe('2026-10-25')
  })
})

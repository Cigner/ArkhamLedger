import { Temporal } from './temporal'

/**
 * Rendering a window of time to a person.
 *
 * Shared by every screen that prints one, so an evening reads identically
 * wherever it appears. Always rendered in the campaign's zone rather than the
 * reader's: a group spread over two countries reading the same screen
 * differently is the failure the campaign zone exists to prevent.
 */

/**
 * Formats a window as a day and an hour range, e.g. `Sunday 11 October, 18:00 – 24:00`.
 *
 * Midnight at the end of an evening is printed as 24:00. `00:00` is the same
 * instant and reads as ending twelve hours before it began, which is how a
 * session that runs until midnight comes to look like a mistake.
 */
export function formatWindow(startUtc: Date, endUtc: Date, timeZone: string): string {
  const start = zoned(startUtc, timeZone)
  const end = zoned(endUtc, timeZone)

  const day = startUtc.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone,
  })

  return `${day}, ${clock(start)} – ${clock(end, { midnightAsEndOfDay: true })}`
}

/**
 * Renders a deadline as the day it runs to the end of.
 *
 * A deadline is stored as the instant the day ends — midnight opening the next
 * one — so formatting it directly would name the wrong date and a time nobody
 * chose. Stepping back a moment puts it back inside the day somebody picked.
 */
export function formatDeadline(instant: Date, timeZone: string): string {
  return new Date(instant.getTime() - 1).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone,
  })
}

/** The deadline's own day, as an ISO date, for putting back into a form. */
export function deadlineToLocalDate(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone,
  }).format(new Date(instant.getTime() - 1))

  return parts
}

/** Whole hours between two instants, which is what the session actually runs. */
export function hoursBetween(startUtc: Date, endUtc: Date): number {
  return Math.round((endUtc.getTime() - startUtc.getTime()) / 3_600_000)
}

function zoned(value: Date, timeZone: string): Temporal.ZonedDateTime {
  return Temporal.Instant.fromEpochMilliseconds(value.getTime()).toZonedDateTimeISO(timeZone)
}

function clock(
  value: Temporal.ZonedDateTime,
  options: { midnightAsEndOfDay?: boolean } = {},
): string {
  const hour =
    options.midnightAsEndOfDay && value.hour === 0 && value.minute === 0 ? 24 : value.hour

  return `${pad(hour)}:${pad(value.minute)}`
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

import { Temporal } from 'temporal-polyfill'

/**
 * Temporal entrypoint.
 *
 * The polyfill is imported rather than the global so behaviour is identical on
 * every engine, including Safari, which still ships only partial support. When
 * the API is universally available this module becomes a one-line re-export and
 * nothing else changes.
 */
export { Temporal }

export type Instant = Temporal.Instant
export type ZonedDateTime = Temporal.ZonedDateTime
export type PlainDate = Temporal.PlainDate

/** Current instant. Only callers outside domain/ may use this. */
export function now(): Temporal.Instant {
  return Temporal.Now.instant()
}

export function instantFromDate(date: Date): Temporal.Instant {
  return Temporal.Instant.fromEpochMilliseconds(date.getTime())
}

export function dateFromInstant(instant: Temporal.Instant): Date {
  return new Date(instant.epochMilliseconds)
}

/** Detects the viewer's IANA zone; falls back to UTC when unavailable. */
export function detectTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/**
 * Checks an IANA zone identifier by asking Intl to resolve it.
 *
 * Abbreviations such as `CST` are rejected on purpose: they are ambiguous across
 * several real zones, and storing one silently produces the wrong hour.
 */
export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone.includes('/') && timeZone !== 'UTC') return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
    return true
  } catch {
    return false
  }
}

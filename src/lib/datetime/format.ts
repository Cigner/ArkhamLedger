import { Temporal } from './temporal'

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

export function formatDeadline(instant: Date, timeZone: string): string {
  return new Date(instant.getTime() - 1).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone,
  })
}

export function deadlineToLocalDate(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone,
  }).format(new Date(instant.getTime() - 1))

  return parts
}

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

import { Temporal } from './temporal'

export type GridBounds = {
  /** Inclusive local start date, ISO `YYYY-MM-DD`. */
  readonly startDate: string
  /** Inclusive local end date, ISO `YYYY-MM-DD`. */
  readonly endDate: string
  /** Local hour the grid starts at, 0–23. */
  readonly startHour: number
  /** Local hour the grid ends at, exclusive, 1–24. */
  readonly endHour: number
  readonly timeZone: string
}

export type GridSlot = {
  /** Canonical key: the exact instant this hour begins. */
  readonly startUtc: string
  readonly localDate: string
  readonly localHour: number
  /**
   * 0 for a normal hour, 1 for the second occurrence of a repeated local hour on
   * an autumn transition day. Lets the UI label the duplicate unambiguously.
   */
  readonly repeatIndex: number
}

const HOURS_PER_DAY = 24

export function generateGridSlots(bounds: GridBounds): GridSlot[] {
  validateBounds(bounds)

  const slots: GridSlot[] = []
  const lastDate = Temporal.PlainDate.from(bounds.endDate)

  let date = Temporal.PlainDate.from(bounds.startDate)

  while (Temporal.PlainDate.compare(date, lastDate) <= 0) {
    slots.push(...slotsForDay(date, bounds))
    date = date.add({ days: 1 })
  }

  return slots
}

function slotsForDay(date: Temporal.PlainDate, bounds: GridBounds): GridSlot[] {
  const dayStart = date.toZonedDateTime({ timeZone: bounds.timeZone })
  const nextDayStart = date.add({ days: 1 }).toZonedDateTime({ timeZone: bounds.timeZone })

  const slots: GridSlot[] = []
  const seenHours = new Map<number, number>()

  let cursor = dayStart
  while (Temporal.ZonedDateTime.compare(cursor, nextDayStart) < 0) {
    const localHour = cursor.hour
    const occurrence = seenHours.get(localHour) ?? 0
    seenHours.set(localHour, occurrence + 1)

    if (localHour >= bounds.startHour && localHour < bounds.endHour) {
      slots.push({
        startUtc: cursor.toInstant().toString(),
        localDate: cursor.toPlainDate().toString(),
        localHour,
        repeatIndex: occurrence,
      })
    }

    cursor = cursor.add({ hours: 1 })
  }

  return slots
}

export function elapsedHours(startUtc: string, endUtc: string): number {
  const start = Temporal.Instant.from(startUtc)
  const end = Temporal.Instant.from(endUtc)
  return start.until(end, { largestUnit: 'hour' }).hours
}

export function addHours(startUtc: string, hours: number): string {
  return Temporal.Instant.from(startUtc).add({ hours }).toString()
}

export function formatLocalHour(startUtc: string, timeZone: string): string {
  const zoned = Temporal.Instant.from(startUtc).toZonedDateTimeISO(timeZone)
  return `${String(zoned.hour).padStart(2, '0')}:00`
}

function validateBounds(bounds: GridBounds): void {
  if (bounds.startHour < 0 || bounds.startHour > HOURS_PER_DAY - 1) {
    throw new RangeError(`startHour out of range: ${bounds.startHour}`)
  }
  if (bounds.endHour < 1 || bounds.endHour > HOURS_PER_DAY) {
    throw new RangeError(`endHour out of range: ${bounds.endHour}`)
  }
  if (bounds.endHour <= bounds.startHour) {
    throw new RangeError('endHour must be greater than startHour')
  }
  if (Temporal.PlainDate.compare(bounds.endDate, bounds.startDate) < 0) {
    throw new RangeError('endDate must not precede startDate')
  }
}

/**
 * Resolves a local wall-clock hour in a zone to the instant it names.
 */
export function localHourToInstant(date: string, hour: number, timeZone: string): Date {
  const zoned = Temporal.PlainDate.from(date).toZonedDateTime({
    timeZone,
    plainTime: Temporal.PlainTime.from({ hour: hour % 24 }),
  })

  const resolved = hour >= 24 ? zoned.add({ days: 1 }) : zoned

  return new Date(resolved.toInstant().epochMilliseconds)
}

/**
 * Parses a `datetime-local` form value in a given zone.
 *
 * Browsers submit these with no offset because the control has no concept of
 * one; interpreting them as UTC - which `new Date()` does for some formats and
 * not others - silently shifts every deadline.
 */
export function localDateTimeToInstant(value: string, timeZone: string): Date | null {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(value)
  if (!match?.[1] || !match[2] || !match[3]) return null

  try {
    const zoned = Temporal.PlainDate.from(match[1]).toZonedDateTime({
      timeZone,
      plainTime: Temporal.PlainTime.from({ hour: Number(match[2]), minute: Number(match[3]) }),
    })
    return new Date(zoned.toInstant().epochMilliseconds)
  } catch {
    return null
  }
}

/** Renders an instant as a `datetime-local` value in a zone, for form defaults. */
export function instantToLocalDateTime(instant: Date, timeZone: string): string {
  const zoned = Temporal.Instant.fromEpochMilliseconds(instant.getTime()).toZonedDateTimeISO(
    timeZone,
  )
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${zoned.year}-${pad(zoned.month)}-${pad(zoned.day)}T${pad(zoned.hour)}:${pad(zoned.minute)}`
}

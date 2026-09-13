import { Temporal } from './temporal'

/**
 * Availability grid slot generation.
 *
 * The grid is defined in a campaign's local wall-clock time, but slots are keyed
 * by the UTC instant they start at. This is the only place in the application
 * that converts between the two, which is what keeps daylight-saving handling
 * from leaking into the algorithm, the repository or the UI.
 *
 * Two transition days need explicit handling and are covered by tests:
 *   - spring forward: the skipped local hour produces no slot at all;
 *   - autumn back: the repeated local hour produces two slots with the same
 *     label and different instants, disambiguated by `repeatIndex`.
 */
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

/**
 * Produces every slot of the grid in chronological order.
 *
 * Iterates instants rather than local hours so that transition days yield the
 * number of slots that actually exist — 23 or 25 — instead of an assumed 24.
 */
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

/**
 * Slots for one local day, bounded by the grid's hour window.
 *
 * Walks the day instant by instant from its true start so that a repeated or
 * missing local hour is observed rather than assumed.
 */
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

/**
 * Number of consecutive real hours between two instants.
 *
 * Used to measure a session window: on a transition day the wall-clock
 * difference and the elapsed hours disagree, and scheduling cares about the
 * elapsed hours.
 */
export function elapsedHours(startUtc: string, endUtc: string): number {
  const start = Temporal.Instant.from(startUtc)
  const end = Temporal.Instant.from(endUtc)
  return start.until(end, { largestUnit: 'hour' }).hours
}

/** Advances an instant by whole hours, independent of any local calendar. */
export function addHours(startUtc: string, hours: number): string {
  return Temporal.Instant.from(startUtc).add({ hours }).toString()
}

/** Renders a slot's local label in the given zone, e.g. `18:00`. */
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

import type { AvailabilityCell, DayRange, SlotState } from './types'

/**
 * Conversion between the day ranges people answer in and the hourly cells the
 * database and the algorithm work in.
 *
 * The single place that knows about the one-range-per-day constraint. Pure, so
 * the round trip can be property-tested without a database.
 */

/** Expands one day's answer into the cells it covers. */
export function rangeToCells(
  range: DayRange,
  slotsForDate: readonly { slotStartUtc: string; localHour: number }[],
): AvailabilityCell[] {
  if (range.state === null) return []

  const covered =
    range.state === 'NO'
      ? slotsForDate
      : slotsForDate.filter(
          (slot) => slot.localHour >= range.fromHour && slot.localHour < range.toHour,
        )

  return covered.map((slot) => ({
    slotStartUtc: slot.slotStartUtc,
    localDate: range.date,
    localHour: slot.localHour,
    state: range.state as SlotState,
  }))
}

/**
 * Collapses stored cells back into one range per day.
 *
 * Tolerant of data the current interface cannot produce - a fragmented answer
 * from an earlier version, or one written directly - by taking the outer bounds
 * of the strongest state present. Losing the gap is acceptable because no
 * session could have used it; silently dropping the whole answer would not be.
 */
export function cellsToRanges(
  cells: readonly AvailabilityCell[],
  dates: readonly string[],
): DayRange[] {
  const byDate = new Map<string, AvailabilityCell[]>()
  for (const cell of cells) {
    const bucket = byDate.get(cell.localDate)
    if (bucket) bucket.push(cell)
    else byDate.set(cell.localDate, [cell])
  }

  return dates.map((date) => {
    const forDate = byDate.get(date)
    if (!forDate || forDate.length === 0) {
      return { date, state: null, fromHour: 0, toHour: 0 }
    }

    const state = dominantState(forDate)

    if (state === 'NO') return { date, state, fromHour: 0, toHour: 0 }

    const matching = forDate.filter((cell) => cell.state === state)
    const hours = matching.map((cell) => cell.localHour)

    return {
      date,
      state,
      fromHour: Math.min(...hours),
      toHour: Math.max(...hours) + 1,
    }
  })
}

/**
 * Which state represents the day.
 *
 * A positive answer outranks a refusal: somebody who marked the evening free and
 * one hour blocked is available, not unavailable.
 */
function dominantState(cells: readonly AvailabilityCell[]): SlotState {
  if (cells.some((cell) => cell.state === 'YES')) return 'YES'
  if (cells.some((cell) => cell.state === 'IF_NEED_BE')) return 'IF_NEED_BE'
  return 'NO'
}

/**
 * Whether a range can host a session of the required length.
 *
 * Surfaced in the interface rather than only enforced by the algorithm: a player
 * who marks four hours on a six-hour session believes they have helped, and
 * finding out from a scheduling result nobody explains is worse than being told
 * while answering.
 */
export function rangeIsLongEnough(range: DayRange, minSessionHours: number): boolean {
  if (range.state === null || range.state === 'NO') return true
  return range.toHour - range.fromHour >= minSessionHours
}

/** Normalises a range, clamping it to the grid and ordering its bounds. */
export function normalizeRange(
  range: DayRange,
  gridStartHour: number,
  gridEndHour: number,
): DayRange {
  if (range.state === null || range.state === 'NO') {
    return { date: range.date, state: range.state, fromHour: 0, toHour: 0 }
  }

  const from = Math.max(gridStartHour, Math.min(range.fromHour, gridEndHour - 1))
  const to = Math.min(gridEndHour, Math.max(range.toHour, from + 1))

  return { date: range.date, state: range.state, fromHour: from, toHour: to }
}

/** The default a single click produces: free from here to the end of the evening. */
export function rangeFromHour(
  date: string,
  hour: number,
  gridEndHour: number,
  state: SlotState = 'YES',
): DayRange {
  return { date, state, fromHour: hour, toHour: gridEndHour }
}

/**
 * The state a repeated click moves to.
 *
 * Cycling through every state from one control keeps the common case to a single
 * action while still letting a player express a refusal without hunting for a
 * different control.
 */
export function nextState(current: SlotState | null): SlotState | null {
  switch (current) {
    case null:
      return 'YES'
    case 'YES':
      return 'IF_NEED_BE'
    case 'IF_NEED_BE':
      return 'NO'
    case 'NO':
      return null
  }
}

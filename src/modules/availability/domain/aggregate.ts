import type { DayRange, SlotState, SlotTally, WindowSummary } from './types'

/**
 * Aggregation over everybody's answers.
 *
 * Produces counts and nothing else: no identifier reaches these shapes, which is
 * what makes the result safe to hand to a player. The Keeper's named view is
 * built separately, from a query that authorizes for it.
 *
 * Scoring, priorities and ranking belong to the scheduling module. What lives
 * here is only "how many people could be here", which the grid needs long before
 * an algorithm exists.
 */

/**
 * Below this many answers, per-hour counts stop being an aggregate.
 *
 * With two respondents, "one free at 18:00" plus your own answer identifies the
 * other person exactly. The ranked windows are still shown - they are the useful
 * part - but the hour-by-hour breakdown waits until there is cover to hide in.
 */
export const MIN_RESPONDENTS_FOR_HEATMAP = 3

type Answer = { readonly userId: string; readonly days: readonly DayRange[] }

function stateAt(days: readonly DayRange[], date: string, hour: number): SlotState | null {
  const day = days.find((entry) => entry.date === date)
  if (!day || day.state === null) return null
  if (day.state === 'NO') return 'NO'
  return hour >= day.fromHour && hour < day.toHour ? day.state : null
}

/** Per-hour totals across every invited participant. */
export function tallySlots(
  answers: readonly Answer[],
  slots: readonly { slotStartUtc: string; localDate: string; localHour: number }[],
  participantCount: number,
): SlotTally[] {
  return slots.map((slot) => {
    let yes = 0
    let ifNeedBe = 0
    let no = 0

    for (const answer of answers) {
      const state = stateAt(answer.days, slot.localDate, slot.localHour)
      if (state === 'YES') yes += 1
      else if (state === 'IF_NEED_BE') ifNeedBe += 1
      else if (state === 'NO') no += 1
    }

    return {
      slotStartUtc: slot.slotStartUtc,
      localDate: slot.localDate,
      localHour: slot.localHour,
      yes,
      ifNeedBe,
      no,
      unknown: Math.max(0, participantCount - yes - ifNeedBe - no),
    }
  })
}

/**
 * Windows that could host the session, best first.
 *
 * A participant counts towards a window only if they are free for the whole of
 * its minimum length - availability for five hours of a six-hour session is not
 * partial credit, it is a no. Taking the weakest hour rather than an average is
 * what makes that true.
 *
 * The end is then stretched as far as everybody who counted remains free, which
 * is what "runs to the end of the evening unless somebody has to go" means.
 */
export function summarizeWindows(input: {
  readonly answers: readonly Answer[]
  readonly dates: readonly string[]
  readonly gridStartHour: number
  readonly gridEndHour: number
  readonly minSessionHours: number
  readonly quorum: number
  readonly participantCount: number
}): WindowSummary[] {
  const summaries: WindowSummary[] = []

  for (const date of input.dates) {
    const lastStart = input.gridEndHour - input.minSessionHours

    for (let startHour = input.gridStartHour; startHour <= lastStart; startHour += 1) {
      const coreEnd = startHour + input.minSessionHours

      let available = 0
      let ifNeedBe = 0
      const attending: Answer[] = []

      for (const answer of input.answers) {
        const quality = weakestHour(answer.days, date, startHour, coreEnd)
        if (quality === null) continue

        attending.push(answer)
        available += 1
        if (quality === 'IF_NEED_BE') ifNeedBe += 1
      }

      if (available === 0) continue

      summaries.push({
        date,
        startHour,
        endHour: stretchEnd(attending, date, coreEnd, input.gridEndHour),
        available,
        ifNeedBe,
        total: input.participantCount,
        quorumMet: available >= input.quorum,
      })
    }
  }

  return summaries.sort(compareWindows)
}

/**
 * The weakest state across a window, or null when the person cannot make it.
 *
 * "Weakest" rather than "most common": one hour of unavailability in the middle
 * rules the window out entirely.
 */
function weakestHour(
  days: readonly DayRange[],
  date: string,
  fromHour: number,
  toHour: number,
): SlotState | null {
  let weakest: SlotState = 'YES'

  for (let hour = fromHour; hour < toHour; hour += 1) {
    const state = stateAt(days, date, hour)
    if (state === null || state === 'NO') return null
    if (state === 'IF_NEED_BE') weakest = 'IF_NEED_BE'
  }

  return weakest
}

/** How late the window can run while everybody counted stays free. */
function stretchEnd(
  attending: readonly Answer[],
  date: string,
  coreEnd: number,
  gridEndHour: number,
): number {
  let end = coreEnd

  while (end < gridEndHour) {
    const everyoneStays = attending.every((answer) => {
      const state = stateAt(answer.days, date, end)
      return state === 'YES' || state === 'IF_NEED_BE'
    })

    if (!everyoneStays) break
    end += 1
  }

  return end
}

/**
 * Ordering for the summary list.
 *
 * Deterministic to the last tie-breaker, so the same answers always produce the
 * same list and a player who reloads does not see it reshuffle.
 */
function compareWindows(a: WindowSummary, b: WindowSummary): number {
  if (a.quorumMet !== b.quorumMet) return a.quorumMet ? -1 : 1
  if (a.available !== b.available) return b.available - a.available
  if (a.ifNeedBe !== b.ifNeedBe) return a.ifNeedBe - b.ifNeedBe

  const aLength = a.endHour - a.startHour
  const bLength = b.endHour - b.startHour
  if (aLength !== bLength) return bLength - aLength

  if (a.date !== b.date) return a.date < b.date ? -1 : 1
  return a.startHour - b.startHour
}

/**
 * Keeps only the best window per day.
 *
 * Consecutive start hours on the same evening are near-duplicates; listing all
 * of them buries the days that differ under variations of one.
 */
export function bestPerDay(windows: readonly WindowSummary[]): WindowSummary[] {
  const seen = new Set<string>()
  return windows.filter((window) => {
    if (seen.has(window.date)) return false
    seen.add(window.date)
    return true
  })
}

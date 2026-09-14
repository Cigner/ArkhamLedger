import type { DayRange, SlotState } from '../domain/types'

/**
 * One-action answers.
 *
 * These are not only a convenience. They are the route through the grid for
 * somebody using a keyboard or a switch, who would otherwise step through every
 * cell of a fortnight; and they match how people actually describe their week —
 * "weeknights after six", not a set of ninety-six hours.
 */
export type PresetId = 'weeknights' | 'weekends' | 'everyEvening' | 'noneOfThese' | 'clear'

export type Preset = {
  readonly id: PresetId
  readonly label: string
  readonly description: string
}

export const PRESETS: readonly Preset[] = [
  {
    id: 'weeknights',
    label: 'Weeknights',
    description: 'Free every Monday to Friday evening, from the usual start.',
  },
  {
    id: 'weekends',
    label: 'Weekends',
    description: 'Free on Saturdays and Sundays, the whole evening.',
  },
  {
    id: 'everyEvening',
    label: 'Every evening',
    description: 'Free on every date offered.',
  },
  {
    id: 'noneOfThese',
    label: 'None of these',
    description: 'Cannot make any of the dates offered.',
  },
  { id: 'clear', label: 'Start again', description: 'Clears every answer.' },
]

const WEEKEND = new Set([0, 6])

function weekdayOf(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay()
}

/**
 * Builds a complete answer from a preset.
 *
 * Returns every date rather than only the ones it touches, so applying a preset
 * replaces the answer instead of layering onto whatever was there — which is
 * what "weeknights" means when said out loud.
 */
export function applyPreset(input: {
  readonly preset: PresetId
  readonly dates: readonly string[]
  readonly gridStartHour: number
  readonly gridEndHour: number
  /** Typical start; earlier hours are rarely what somebody means by "the evening". */
  readonly usualStartHour: number
}): DayRange[] {
  const full = (date: string, state: SlotState): DayRange => ({
    date,
    state,
    fromHour: state === 'NO' ? 0 : input.usualStartHour,
    toHour: state === 'NO' ? 0 : input.gridEndHour,
  })

  const blank = (date: string): DayRange => ({ date, state: null, fromHour: 0, toHour: 0 })

  return input.dates.map((date) => {
    const weekend = WEEKEND.has(weekdayOf(date))

    switch (input.preset) {
      case 'weeknights':
        return weekend ? blank(date) : full(date, 'YES')
      case 'weekends':
        return weekend ? full(date, 'YES') : blank(date)
      case 'everyEvening':
        return full(date, 'YES')
      case 'noneOfThese':
        return full(date, 'NO')
      case 'clear':
        return blank(date)
    }
  })
}

/**
 * Maps a previous session's weekday-shaped answer onto this window's dates.
 *
 * Dates do not repeat; "Thursdays" does. Any date whose weekday was not answered
 * last time is left blank rather than guessed at.
 */
export function applyPreviousAnswer(input: {
  readonly byWeekday: readonly {
    weekday: number
    state: SlotState | null
    fromHour: number
    toHour: number
  }[]
  readonly dates: readonly string[]
}): DayRange[] {
  const lookup = new Map(input.byWeekday.map((entry) => [entry.weekday, entry]))

  return input.dates.map((date) => {
    const previous = lookup.get(weekdayOf(date))
    if (!previous || previous.state === null) {
      return { date, state: null, fromHour: 0, toHour: 0 }
    }
    return {
      date,
      state: previous.state,
      fromHour: previous.fromHour,
      toHour: previous.toHour,
    }
  })
}

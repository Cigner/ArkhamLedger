import { addHours, generateGridSlots } from '@/lib/datetime/slots'
import type { SlotState } from '@/modules/availability/domain/types'
import type {
  SchedulingInput,
  SchedulingParticipant,
  SchedulingSlot,
} from '@/modules/scheduling/domain/types'
import type { ParticipantPriority } from '@/modules/sessions/domain/types'

/**
 * Test fixtures for the scheduling algorithm.
 *
 * Slots come from the real grid generator rather than from hand-written
 * instants, so daylight-saving behaviour under test is the behaviour the
 * application actually produces — a fixture that invents 24 hours per day would
 * pass while production fails on one night a year.
 */
export const ZONE = 'Europe/Warsaw'

export function grid(options: {
  from: string
  to?: string
  startHour?: number
  endHour?: number
  zone?: string
}): SchedulingSlot[] {
  return generateGridSlots({
    startDate: options.from,
    endDate: options.to ?? options.from,
    startHour: options.startHour ?? 16,
    endHour: options.endHour ?? 24,
    timeZone: options.zone ?? ZONE,
  }).map((slot) => ({
    startUtc: slot.startUtc,
    endUtc: addHours(slot.startUtc, 1),
    localDate: slot.localDate,
    localHour: slot.localHour,
  }))
}

/** One day's answer, in the shape a person would say it out loud. */
type DayAnswer = {
  readonly state?: SlotState
  readonly from?: number
  readonly to?: number
}

export function person(
  slots: readonly SchedulingSlot[],
  userId: string,
  options: {
    priority?: ParticipantPriority
    keeper?: boolean
    responded?: boolean
    days?: Readonly<Record<string, DayAnswer>>
  } = {},
): SchedulingParticipant {
  const availability = new Map<string, SlotState>()

  for (const slot of slots) {
    const answer = options.days?.[slot.localDate]
    if (!answer) continue

    const state = answer.state ?? 'YES'
    if (state === 'NO') {
      availability.set(slot.startUtc, 'NO')
      continue
    }

    const from = answer.from ?? 0
    const to = answer.to ?? 24
    if (slot.localHour >= from && slot.localHour < to) availability.set(slot.startUtc, state)
  }

  return {
    userId,
    // Keepers are normalised to REQUIRED everywhere else, so fixtures do too.
    priority: options.keeper ? 'REQUIRED' : (options.priority ?? 'PREFERRED'),
    isKeeper: options.keeper ?? false,
    hasResponded: options.responded ?? options.days !== undefined,
    availability,
  }
}

export function input(options: {
  slots: readonly SchedulingSlot[]
  participants: readonly SchedulingParticipant[]
  minSessionHours?: number
  quorum?: number
}): SchedulingInput {
  return {
    slots: options.slots,
    participants: options.participants,
    minSessionHours: options.minSessionHours ?? 6,
    quorum: options.quorum ?? 1,
  }
}

/** Free for every date given, which most tests vary one answer from. */
export function everyDay(
  dates: readonly string[],
  answer: DayAnswer = {},
): Readonly<Record<string, DayAnswer>> {
  return Object.fromEntries(dates.map((date) => [date, answer]))
}

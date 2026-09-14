import { describe, expect, it } from 'vitest'
import {
  MIN_RESPONDENTS_FOR_HEATMAP,
  bestPerDay,
  summarizeWindows,
  tallySlots,
} from '@/modules/availability/domain/aggregate'
import type { DayRange } from '@/modules/availability/domain/types'

/**
 * Aggregation.
 *
 * Built on the fixture from the development seed, whose answer was worked out on
 * paper before any of this existed: Thursday the 8th wins outright, Sunday the
 * 11th is second because one player is grudging and another leaves at eight, and
 * Monday the 5th is out because two people refused it.
 *
 * Testing against a result derived independently is the point — a test that
 * merely re-runs the implementation proves only that it is deterministic.
 */
const DATES = ['2026-10-05', '2026-10-08', '2026-10-11', '2026-10-15']

function day(date: string, state: DayRange['state'], fromHour = 0, toHour = 0): DayRange {
  return { date, state, fromHour, toHour }
}

function blank(dates: readonly string[], except: readonly DayRange[]): DayRange[] {
  const given = new Map(except.map((entry) => [entry.date, entry]))
  return dates.map((date) => given.get(date) ?? day(date, null))
}

const ANSWERS = [
  {
    userId: 'eleanor',
    days: blank(DATES, [
      day('2026-10-05', 'YES', 18, 24),
      day('2026-10-08', 'YES', 18, 24),
      day('2026-10-11', 'YES', 16, 24),
      day('2026-10-15', 'YES', 20, 24),
    ]),
  },
  {
    userId: 'harriet',
    days: blank(DATES, [
      day('2026-10-05', 'NO'),
      day('2026-10-08', 'YES', 17, 24),
      day('2026-10-11', 'YES', 17, 24),
      day('2026-10-15', 'YES', 20, 24),
    ]),
  },
  {
    userId: 'anna',
    days: blank(DATES, [
      day('2026-10-05', 'NO'),
      day('2026-10-08', 'YES', 18, 24),
      day('2026-10-11', 'IF_NEED_BE', 17, 24),
      day('2026-10-15', 'YES', 20, 24),
    ]),
  },
  {
    userId: 'tomas',
    days: blank(DATES, [
      day('2026-10-05', 'YES', 18, 24),
      day('2026-10-08', 'YES', 16, 24),
      day('2026-10-11', 'YES', 18, 24),
    ]),
  },
  {
    userId: 'jozef',
    days: blank(DATES, [day('2026-10-08', 'YES', 18, 24), day('2026-10-11', 'YES', 16, 20)]),
  },
  // Marcus never answers. Distinct from refusing, and the distinction the whole
  // quorum idea rests on.
  { userId: 'marcus', days: blank(DATES, []) },
]

const GRID = { gridStartHour: 16, gridEndHour: 24, minSessionHours: 6, quorum: 4 }

function summarize() {
  return summarizeWindows({
    answers: ANSWERS,
    dates: DATES,
    participantCount: ANSWERS.length,
    ...GRID,
  })
}

describe('summarizeWindows', () => {
  it('picks Thursday the 8th at 18:00 as the best window', () => {
    const best = summarize()[0]

    expect(best).toMatchObject({
      date: '2026-10-08',
      startHour: 18,
      endHour: 24,
      available: 5,
      ifNeedBe: 0,
      quorumMet: true,
    })
  })

  it('ranks Sunday the 11th below it, and says why', () => {
    const sunday = bestPerDay(summarize()).find((window) => window.date === '2026-10-11')

    // Eleanor, Harriet, Anna and Tomás can do 18:00 onward; Anna only grudgingly,
    // and Józef has gone by eight.
    expect(sunday).toMatchObject({ startHour: 18, available: 4, ifNeedBe: 1, quorumMet: true })
  })

  it('never offers Monday the 5th above quorum', () => {
    const monday = summarize().filter((window) => window.date === '2026-10-05')

    expect(monday.every((window) => !window.quorumMet)).toBe(true)
    expect(monday.every((window) => window.available <= 2)).toBe(true)
  })

  /*
   * Everybody free from eight, which is four hours: not enough for a six-hour
   * session, so the day produces no window at all rather than a short one.
   */
  it('omits a day whose free time is shorter than the session needs', () => {
    expect(summarize().some((window) => window.date === '2026-10-15')).toBe(false)
  })

  it('counts nobody who is free for only part of the window', () => {
    const answers = [
      { userId: 'partial', days: blank(DATES, [day('2026-10-08', 'YES', 18, 22)]) },
      { userId: 'full', days: blank(DATES, [day('2026-10-08', 'YES', 18, 24)]) },
    ]

    const windows = summarizeWindows({
      answers,
      dates: ['2026-10-08'],
      participantCount: 2,
      ...GRID,
      quorum: 1,
    })

    expect(windows[0]).toMatchObject({ startHour: 18, available: 1 })
  })

  /*
   * "Runs to the end of the evening unless somebody has to go": the end stretches
   * only while everybody who counted stays free.
   */
  it('stretches the end while everybody attending remains free', () => {
    const answers = [
      { userId: 'a', days: blank(DATES, [day('2026-10-08', 'YES', 16, 24)]) },
      { userId: 'b', days: blank(DATES, [day('2026-10-08', 'YES', 16, 23)]) },
    ]

    const windows = summarizeWindows({
      answers,
      dates: ['2026-10-08'],
      participantCount: 2,
      ...GRID,
      quorum: 2,
    })

    const earliest = windows.find((window) => window.startHour === 16)
    expect(earliest).toMatchObject({ available: 2, endHour: 23 })
  })

  it('orders windows that meet quorum ahead of those that do not', () => {
    const windows = summarize()
    const firstFailing = windows.findIndex((window) => !window.quorumMet)
    const lastPassing = windows.map((window) => window.quorumMet).lastIndexOf(true)

    expect(firstFailing).toBeGreaterThan(lastPassing)
  })

  it('is deterministic', () => {
    expect(summarize()).toEqual(summarize())
  })
})

describe('tallySlots', () => {
  const slots = Array.from({ length: 8 }, (_, index) => ({
    slotStartUtc: `2026-10-08T${String(14 + index).padStart(2, '0')}:00:00Z`,
    localDate: '2026-10-08',
    localHour: 16 + index,
  }))

  it('counts each state and treats silence as unknown', () => {
    const tally = tallySlots(ANSWERS, slots, ANSWERS.length).find((entry) => entry.localHour === 18)

    expect(tally).toMatchObject({ yes: 5, ifNeedBe: 0, no: 0, unknown: 1 })
  })

  it('counts a refusal against every hour of the day', () => {
    const mondaySlots = slots.map((slot) => ({ ...slot, localDate: '2026-10-05' }))
    const tallies = tallySlots(ANSWERS, mondaySlots, ANSWERS.length)

    expect(tallies.every((tally) => tally.no === 2)).toBe(true)
  })

  it('never lets the counts exceed the number of participants', () => {
    for (const tally of tallySlots(ANSWERS, slots, ANSWERS.length)) {
      expect(tally.yes + tally.ifNeedBe + tally.no + tally.unknown).toBe(ANSWERS.length)
    }
  })
})

describe('bestPerDay', () => {
  it('keeps one window per date', () => {
    const perDay = bestPerDay(summarize())
    expect(new Set(perDay.map((window) => window.date)).size).toBe(perDay.length)
  })

  it('keeps the best window for each date', () => {
    const thursday = bestPerDay(summarize()).find((window) => window.date === '2026-10-08')
    expect(thursday).toMatchObject({ available: 5 })
  })
})

describe('heatmap disclosure threshold', () => {
  /*
   * With two answers, "one person free at 18:00" plus your own answer names the
   * other one exactly. The ranked windows stay — they are the useful part — but
   * the hour-by-hour breakdown waits for cover to hide in.
   */
  it('is set high enough that a single other answer cannot be isolated', () => {
    expect(MIN_RESPONDENTS_FOR_HEATMAP).toBeGreaterThanOrEqual(3)
  })
})

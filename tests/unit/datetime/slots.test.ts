import { describe, expect, it } from 'vitest'
import {
  addHours,
  elapsedHours,
  formatLocalHour,
  generateGridSlots,
  type GridBounds,
} from '@/lib/datetime/slots'

/**
 * Grid generation, with daylight-saving transitions as first-class cases.
 *
 * Europe/Warsaw is the deployment's default zone: clocks move forward on the
 * last Sunday of March and back on the last Sunday of October.
 */
const WARSAW = 'Europe/Warsaw'

function bounds(overrides: Partial<GridBounds> = {}): GridBounds {
  return {
    startDate: '2026-10-05',
    endDate: '2026-10-05',
    startHour: 16,
    endHour: 24,
    timeZone: WARSAW,
    ...overrides,
  }
}

describe('generateGridSlots', () => {
  it('produces one slot per hour of the window', () => {
    const slots = generateGridSlots(bounds())

    expect(slots).toHaveLength(8)
    expect(slots[0]?.localHour).toBe(16)
    expect(slots.at(-1)?.localHour).toBe(23)
  })

  it('keys slots by UTC instant while reporting local labels', () => {
    const slots = generateGridSlots(bounds({ startHour: 18, endHour: 19 }))

    // Warsaw is UTC+2 in early October (summer time still in effect).
    expect(slots[0]?.startUtc).toBe('2026-10-05T16:00:00Z')
    expect(slots[0]?.localDate).toBe('2026-10-05')
    expect(slots[0]?.localHour).toBe(18)
  })

  it('spans multiple days in chronological order', () => {
    const slots = generateGridSlots(
      bounds({ startDate: '2026-10-05', endDate: '2026-10-07', startHour: 20, endHour: 22 }),
    )

    expect(slots).toHaveLength(6)
    expect(slots.map((s) => s.localDate)).toEqual([
      '2026-10-05',
      '2026-10-05',
      '2026-10-06',
      '2026-10-06',
      '2026-10-07',
      '2026-10-07',
    ])

    const instants = slots.map((s) => Date.parse(s.startUtc))
    expect([...instants].sort((a, b) => a - b)).toEqual(instants)
  })

  describe('daylight saving: spring forward', () => {
    // 2026-03-29: 02:00 local jumps to 03:00, so local hour 2 does not exist.
    const springBounds = bounds({
      startDate: '2026-03-29',
      endDate: '2026-03-29',
      startHour: 0,
      endHour: 24,
    })

    it('yields 23 slots for the shortened day', () => {
      expect(generateGridSlots(springBounds)).toHaveLength(23)
    })

    it('omits the local hour that does not exist', () => {
      const hours = generateGridSlots(springBounds).map((s) => s.localHour)

      expect(hours).not.toContain(2)
      expect(hours).toContain(1)
      expect(hours).toContain(3)
    })
  })

  describe('daylight saving: autumn back', () => {
    // 2026-10-25: 03:00 local returns to 02:00, so local hour 2 happens twice.
    const autumnBounds = bounds({
      startDate: '2026-10-25',
      endDate: '2026-10-25',
      startHour: 0,
      endHour: 24,
    })

    it('yields 25 slots for the lengthened day', () => {
      expect(generateGridSlots(autumnBounds)).toHaveLength(25)
    })

    it('emits the repeated local hour twice with distinct instants', () => {
      const repeated = generateGridSlots(autumnBounds).filter((s) => s.localHour === 2)

      expect(repeated).toHaveLength(2)
      expect(repeated[0]?.repeatIndex).toBe(0)
      expect(repeated[1]?.repeatIndex).toBe(1)
      expect(repeated[0]?.startUtc).not.toBe(repeated[1]?.startUtc)
      expect(elapsedHours(repeated[0]!.startUtc, repeated[1]!.startUtc)).toBe(1)
    })

    it('keeps every slot on the day unique by instant', () => {
      const instants = generateGridSlots(autumnBounds).map((s) => s.startUtc)
      expect(new Set(instants).size).toBe(instants.length)
    })
  })

  describe('validation', () => {
    it.each([
      ['endHour not after startHour', { startHour: 20, endHour: 20 }],
      ['startHour out of range', { startHour: 24, endHour: 24 }],
      ['endHour above 24', { startHour: 0, endHour: 25 }],
      ['endDate before startDate', { startDate: '2026-10-05', endDate: '2026-10-04' }],
    ])('rejects %s', (_label, override) => {
      expect(() => generateGridSlots(bounds(override))).toThrow(RangeError)
    })
  })
})

describe('elapsedHours', () => {
  it('counts real elapsed hours, not wall-clock difference', () => {
    // 2026-10-25 in Warsaw: local 00:00 to local 06:00 spans seven real hours.
    const start = '2026-10-24T22:00:00Z'
    const end = '2026-10-25T05:00:00Z'

    expect(elapsedHours(start, end)).toBe(7)
  })

  it('is symmetric with addHours', () => {
    const start = '2026-10-25T00:00:00Z'
    expect(elapsedHours(start, addHours(start, 6))).toBe(6)
  })
})

describe('formatLocalHour', () => {
  it('renders the instant in the requested zone', () => {
    expect(formatLocalHour('2026-10-05T16:00:00Z', WARSAW)).toBe('18:00')
    expect(formatLocalHour('2026-10-05T16:00:00Z', 'UTC')).toBe('16:00')
  })

  it('renders both halves of a repeated hour with the same label', () => {
    const first = formatLocalHour('2026-10-25T00:00:00Z', WARSAW)
    const second = formatLocalHour('2026-10-25T01:00:00Z', WARSAW)

    expect(first).toBe('02:00')
    expect(second).toBe('02:00')
  })
})

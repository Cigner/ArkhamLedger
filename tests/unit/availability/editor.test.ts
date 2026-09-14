import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useAvailabilityEditor } from '@/modules/availability/ui/use-availability-editor'
import type { DayRange } from '@/modules/availability/domain/types'

/**
 * Answering behaviour.
 *
 * What a player actually feels: one tap to answer an evening, the same tap again
 * to change how firm that is, and a dialog when they need to be exact. Tested
 * without a DOM because it is all state — which is why it lives in a hook.
 */
// Thursday, Friday, Saturday, Sunday.
const DATES = ['2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']

function setup(initial: readonly DayRange[] = []) {
  return renderHook(() =>
    useAvailabilityEditor({ initial, dates: DATES, gridStartHour: 12, gridEndHour: 24 }),
  )
}

describe('one tap answers an evening', () => {
  it('marks the whole evening free', () => {
    const { result } = setup()

    act(() => result.current.cycleDay('2026-10-08'))

    expect(result.current.rangeFor('2026-10-08')).toEqual({
      date: '2026-10-08',
      state: 'YES',
      fromHour: 12,
      toHour: 24,
    })
  })

  it('leaves other evenings untouched', () => {
    const { result } = setup()

    act(() => result.current.cycleDay('2026-10-08'))

    expect(result.current.rangeFor('2026-10-09').state).toBeNull()
  })

  it('cycles free, at a push, not free, blank', () => {
    const { result } = setup()
    const states: (string | null)[] = []

    for (let tap = 0; tap < 4; tap += 1) {
      act(() => result.current.cycleDay('2026-10-08'))
      states.push(result.current.rangeFor('2026-10-08').state)
    }

    expect(states).toEqual(['YES', 'IF_NEED_BE', 'NO', null])
  })

  /*
   * Somebody who set "from eight" and then marks the evening grudging still
   * means from eight. Resetting the hours on every cycle would quietly discard
   * the more precise thing they said.
   */
  it('keeps hours already chosen when firmness changes', () => {
    const { result } = setup([{ date: '2026-10-08', state: 'YES', fromHour: 20, toHour: 24 }])

    act(() => result.current.cycleDay('2026-10-08'))

    expect(result.current.rangeFor('2026-10-08')).toMatchObject({
      state: 'IF_NEED_BE',
      fromHour: 20,
      toHour: 24,
    })
  })
})

describe('the per-day dialog', () => {
  it('sets firmness without touching the hours', () => {
    const { result } = setup([{ date: '2026-10-08', state: 'YES', fromHour: 19, toHour: 23 }])

    act(() => result.current.setState('2026-10-08', 'IF_NEED_BE'))

    expect(result.current.rangeFor('2026-10-08')).toMatchObject({
      state: 'IF_NEED_BE',
      fromHour: 19,
      toHour: 23,
    })
  })

  it('defaults a fresh evening to its whole span', () => {
    const { result } = setup()

    act(() => result.current.setState('2026-10-08', 'YES'))

    expect(result.current.rangeFor('2026-10-08')).toMatchObject({ fromHour: 12, toHour: 24 })
  })

  it('sets an exact range', () => {
    const { result } = setup()

    act(() => result.current.setRangeWithState('2026-10-08', 'YES', 18, 23))

    expect(result.current.rangeFor('2026-10-08')).toEqual({
      date: '2026-10-08',
      state: 'YES',
      fromHour: 18,
      toHour: 23,
    })
  })

  it('keeps a grudging answer grudging when only the hours move', () => {
    const { result } = setup([
      { date: '2026-10-08', state: 'IF_NEED_BE', fromHour: 12, toHour: 24 },
    ])

    act(() => result.current.setRange('2026-10-08', 19, 24))

    expect(result.current.rangeFor('2026-10-08').state).toBe('IF_NEED_BE')
  })

  it('clamps a range to the offered hours', () => {
    const { result } = setup()

    act(() => result.current.setRangeWithState('2026-10-08', 'YES', 6, 30))

    expect(result.current.rangeFor('2026-10-08')).toMatchObject({ fromHour: 12, toHour: 24 })
  })

  it('clears an evening', () => {
    const { result } = setup([{ date: '2026-10-08', state: 'YES', fromHour: 18, toHour: 24 }])

    act(() => result.current.clearDay('2026-10-08'))

    expect(result.current.rangeFor('2026-10-08').state).toBeNull()
  })

  /*
   * A refusal is about the date, so its hours stop meaning anything and are
   * zeroed — otherwise a stale range would reappear if the evening were later
   * marked free again.
   */
  it('drops the hours of a refusal', () => {
    const { result } = setup([{ date: '2026-10-08', state: 'YES', fromHour: 18, toHour: 24 }])

    act(() => result.current.setState('2026-10-08', 'NO'))

    expect(result.current.rangeFor('2026-10-08')).toEqual({
      date: '2026-10-08',
      state: 'NO',
      fromHour: 0,
      toHour: 0,
    })
  })
})

describe('presets', () => {
  it('fills weeknights and leaves the weekend blank', () => {
    const { result } = setup()

    act(() => result.current.usePreset('weeknights'))

    expect(result.current.rangeFor('2026-10-08').state).toBe('YES')
    expect(result.current.rangeFor('2026-10-09').state).toBe('YES')
    expect(result.current.rangeFor('2026-10-10').state).toBeNull()
    expect(result.current.rangeFor('2026-10-11').state).toBeNull()
  })

  it('fills the weekend and leaves weeknights blank', () => {
    const { result } = setup()

    act(() => result.current.usePreset('weekends'))

    expect(result.current.rangeFor('2026-10-10').state).toBe('YES')
    expect(result.current.rangeFor('2026-10-08').state).toBeNull()
  })

  it('refuses every date at once', () => {
    const { result } = setup()

    act(() => result.current.usePreset('noneOfThese'))

    expect(DATES.every((date) => result.current.rangeFor(date).state === 'NO')).toBe(true)
  })

  /*
   * A preset replaces the answer rather than layering onto it, which is what
   * "weeknights" means when somebody says it out loud.
   */
  it('replaces whatever was there', () => {
    const { result } = setup([{ date: '2026-10-10', state: 'YES', fromHour: 12, toHour: 24 }])

    act(() => result.current.usePreset('weeknights'))

    expect(result.current.rangeFor('2026-10-10').state).toBeNull()
  })
})

describe('same as last time', () => {
  it('maps a weekday answer onto this window’s dates', () => {
    const { result } = setup()

    act(() =>
      // Thursday, from seven.
      result.current.useSuggestion([{ weekday: 4, state: 'YES', fromHour: 19, toHour: 24 }]),
    )

    expect(result.current.rangeFor('2026-10-08')).toMatchObject({ fromHour: 19, toHour: 24 })
    expect(result.current.rangeFor('2026-10-09').state).toBeNull()
  })

  it('leaves weekdays that were not answered last time blank', () => {
    const { result } = setup()

    act(() => result.current.useSuggestion([{ weekday: 0, state: 'NO', fromHour: 0, toHour: 0 }]))

    expect(result.current.rangeFor('2026-10-11').state).toBe('NO')
    expect(result.current.rangeFor('2026-10-08').state).toBeNull()
  })
})

describe('unsaved changes', () => {
  it('starts clean', () => {
    expect(setup().result.current.isDirty).toBe(false)
  })

  it('notices an edit', () => {
    const { result } = setup()

    act(() => result.current.cycleDay('2026-10-08'))

    expect(result.current.isDirty).toBe(true)
  })

  it('goes clean again when the edit is undone', () => {
    const { result } = setup()

    act(() => result.current.cycleDay('2026-10-08'))
    act(() => result.current.reset())

    expect(result.current.isDirty).toBe(false)
  })

  /*
   * Without this the form reports unsaved changes forever after the first save,
   * which teaches people to distrust the indicator meant to reassure them.
   */
  it('goes clean once the answer is accepted as saved', () => {
    const { result } = setup()

    act(() => result.current.cycleDay('2026-10-08'))
    act(() => result.current.markSaved())

    expect(result.current.isDirty).toBe(false)
  })

  it('reverts to the saved answer rather than the original one', () => {
    const { result } = setup()

    act(() => result.current.cycleDay('2026-10-08'))
    act(() => result.current.markSaved())
    act(() => result.current.cycleDay('2026-10-09'))
    act(() => result.current.reset())

    expect(result.current.rangeFor('2026-10-08').state).toBe('YES')
    expect(result.current.rangeFor('2026-10-09').state).toBeNull()
  })

  it('does not count a full cycle back to blank as a change', () => {
    const { result } = setup()

    for (let tap = 0; tap < 4; tap += 1) {
      act(() => result.current.cycleDay('2026-10-08'))
    }

    expect(result.current.isDirty).toBe(false)
  })
})

describe('toArray', () => {
  it('returns one entry per date, in order', () => {
    const { result } = setup()

    act(() => result.current.cycleDay('2026-10-09'))

    expect(result.current.toArray().map((range) => range.date)).toEqual(DATES)
  })
})

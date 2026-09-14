import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useAvailabilityEditor } from '@/modules/availability/ui/use-availability-editor'
import type { DayRange } from '@/modules/availability/domain/types'

/**
 * Grid interaction.
 *
 * The behaviour a player actually feels: one click to answer a day, the same
 * click again to change how firm that answer is, a drag when they have to leave
 * early. Tested without a DOM because it is all state — which is why it lives in
 * a hook rather than inside the component.
 */
// Thursday, Friday, Saturday, Sunday.
const DATES = ['2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']

function setup(initial: readonly DayRange[] = []) {
  return renderHook(() =>
    useAvailabilityEditor({ initial, dates: DATES, gridStartHour: 16, gridEndHour: 24 }),
  )
}

describe('one click answers a day', () => {
  it('marks free from the clicked hour to the end of the evening', () => {
    const { result } = setup()

    act(() => result.current.toggleHour('2026-10-08', 18))

    expect(result.current.rangeFor('2026-10-08')).toEqual({
      date: '2026-10-08',
      state: 'YES',
      fromHour: 18,
      toHour: 24,
    })
  })

  it('leaves other days untouched', () => {
    const { result } = setup()

    act(() => result.current.toggleHour('2026-10-08', 18))

    expect(result.current.rangeFor('2026-10-09').state).toBeNull()
  })

  it('moves the start when a different hour is clicked', () => {
    const { result } = setup()

    act(() => result.current.toggleHour('2026-10-08', 18))
    act(() => result.current.toggleHour('2026-10-08', 20))

    expect(result.current.rangeFor('2026-10-08')).toMatchObject({ fromHour: 20, toHour: 24 })
  })

  it('keeps how firm the answer was when the start moves', () => {
    const { result } = setup()

    act(() => result.current.toggleHour('2026-10-08', 18))
    act(() => result.current.toggleHour('2026-10-08', 18))
    act(() => result.current.toggleHour('2026-10-08', 20))

    expect(result.current.rangeFor('2026-10-08')).toMatchObject({
      state: 'IF_NEED_BE',
      fromHour: 20,
    })
  })
})

describe('clicking the same hour cycles the answer', () => {
  it('goes free, then at a push, then not at all, then blank', () => {
    const { result } = setup()
    const states: (string | null)[] = []

    for (let click = 0; click < 4; click += 1) {
      act(() => result.current.toggleHour('2026-10-08', 18))
      states.push(result.current.rangeFor('2026-10-08').state)
    }

    expect(states).toEqual(['YES', 'IF_NEED_BE', 'NO', null])
  })

  /*
   * A refusal covers the whole day and has no hour to anchor a cycle to, so
   * clicking any hour lifts it and leaves the day blank. A second click then
   * answers it — two predictable steps rather than one whose meaning depends on
   * history the grid cannot show.
   */
  it('clears a refused day on any hour click, then answers on the next', () => {
    const { result } = setup()

    act(() => result.current.toggleHour('2026-10-08', 18))
    act(() => result.current.toggleHour('2026-10-08', 18))
    act(() => result.current.toggleHour('2026-10-08', 18))
    expect(result.current.rangeFor('2026-10-08').state).toBe('NO')

    act(() => result.current.toggleHour('2026-10-08', 17))
    expect(result.current.rangeFor('2026-10-08').state).toBeNull()

    act(() => result.current.toggleHour('2026-10-08', 17))
    expect(result.current.rangeFor('2026-10-08')).toMatchObject({
      state: 'YES',
      fromHour: 17,
      toHour: 24,
    })
  })
})

describe('the day header', () => {
  it('answers the whole evening without aiming at an hour', () => {
    const { result } = setup()

    act(() => result.current.cycleDay('2026-10-08'))

    expect(result.current.rangeFor('2026-10-08')).toMatchObject({ fromHour: 16, toHour: 24 })
  })

  it('changes how firm an existing answer is without moving it', () => {
    const { result } = setup([
      { date: '2026-10-08', state: 'YES', fromHour: 19, toHour: 24 },
    ])

    act(() => result.current.cycleDay('2026-10-08'))

    expect(result.current.rangeFor('2026-10-08')).toMatchObject({
      state: 'IF_NEED_BE',
      fromHour: 19,
      toHour: 24,
    })
  })
})

describe('dragging', () => {
  it('previews the range while the pointer moves', () => {
    const { result } = setup()

    act(() => result.current.beginDrag('2026-10-08', 18))
    act(() => result.current.extendDrag(21))

    expect(result.current.rangeFor('2026-10-08')).toMatchObject({ fromHour: 18, toHour: 22 })
  })

  it('works in either direction', () => {
    const { result } = setup()

    act(() => result.current.beginDrag('2026-10-08', 21))
    act(() => result.current.extendDrag(18))

    expect(result.current.rangeFor('2026-10-08')).toMatchObject({ fromHour: 18, toHour: 22 })
  })

  /*
   * Backing up mid-drag has to un-mark what the pointer left behind, which is
   * why the range is recomputed from the anchor rather than accumulated.
   */
  it('shrinks when the pointer comes back', () => {
    const { result } = setup()

    act(() => result.current.beginDrag('2026-10-08', 16))
    act(() => result.current.extendDrag(23))
    act(() => result.current.extendDrag(18))

    expect(result.current.rangeFor('2026-10-08')).toMatchObject({ fromHour: 16, toHour: 19 })
  })

  it('commits on release', () => {
    const { result } = setup()

    act(() => result.current.beginDrag('2026-10-08', 18))
    act(() => result.current.extendDrag(20))
    act(() => result.current.endDrag())

    expect(result.current.drag).toBeNull()
    expect(result.current.rangeFor('2026-10-08')).toMatchObject({ fromHour: 18, toHour: 21 })
  })

  /*
   * The pointer path a real click takes: press and release without moving. Both
   * steps run in one handler, which is where committing from inside a state
   * updater came apart — the earlier tests passed because each step had its own
   * act() and therefore a fresh closure.
   */
  it('treats a press with no movement as a click, not a one-hour range', () => {
    const { result } = setup()

    act(() => {
      result.current.beginDrag('2026-10-08', 18)
      result.current.cancelDrag()
      result.current.toggleHour('2026-10-08', 18)
    })

    expect(result.current.rangeFor('2026-10-08')).toMatchObject({ fromHour: 18, toHour: 24 })
  })

  it('abandons a drag without committing when cancelled', () => {
    const { result } = setup()

    act(() => result.current.beginDrag('2026-10-08', 18))
    act(() => result.current.extendDrag(20))
    act(() => result.current.cancelDrag())

    expect(result.current.drag).toBeNull()
    expect(result.current.rangeFor('2026-10-08').state).toBeNull()
  })

  it('never reaches beyond the day it started in', () => {
    const { result } = setup()

    act(() => result.current.beginDrag('2026-10-08', 18))
    act(() => result.current.extendDrag(22))

    expect(result.current.rangeFor('2026-10-09').state).toBeNull()
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
    const { result } = setup([{ date: '2026-10-10', state: 'YES', fromHour: 16, toHour: 24 }])

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

    act(() => result.current.toggleHour('2026-10-08', 18))

    expect(result.current.isDirty).toBe(true)
  })

  it('goes clean again when the edit is undone', () => {
    const { result } = setup()

    act(() => result.current.toggleHour('2026-10-08', 18))
    act(() => result.current.reset())

    expect(result.current.isDirty).toBe(false)
  })

  /*
   * Without this the form reports unsaved changes forever after the first save,
   * which teaches people to distrust the indicator meant to reassure them.
   */
  it('goes clean once the answer is accepted as saved', () => {
    const { result } = setup()

    act(() => result.current.toggleHour('2026-10-08', 18))
    expect(result.current.isDirty).toBe(true)

    act(() => result.current.markSaved())
    expect(result.current.isDirty).toBe(false)
  })

  it('reverts to the saved answer rather than the original one', () => {
    const { result } = setup()

    act(() => result.current.toggleHour('2026-10-08', 18))
    act(() => result.current.markSaved())
    act(() => result.current.toggleHour('2026-10-09', 20))
    act(() => result.current.reset())

    expect(result.current.rangeFor('2026-10-08')).toMatchObject({ fromHour: 18 })
    expect(result.current.rangeFor('2026-10-09').state).toBeNull()
  })

  it('does not count a blank day as a change', () => {
    const { result } = setup()

    act(() => result.current.toggleHour('2026-10-08', 18))
    act(() => result.current.toggleHour('2026-10-08', 18))
    act(() => result.current.toggleHour('2026-10-08', 18))
    act(() => result.current.toggleHour('2026-10-08', 18))

    expect(result.current.isDirty).toBe(false)
  })
})

describe('toArray', () => {
  it('returns one entry per date, in order', () => {
    const { result } = setup()

    act(() => result.current.toggleHour('2026-10-09', 18))

    expect(result.current.toArray().map((range) => range.date)).toEqual(DATES)
  })
})

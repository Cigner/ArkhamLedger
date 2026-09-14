'use client'

import { useCallback, useRef, useState } from 'react'
import { cn } from '@/lib/cn'
import { rangeIsLongEnough } from '../domain/ranges'
import type { SlotState } from '../domain/types'
import { GridCell } from './grid-cell'
import type { AvailabilityEditor } from './use-availability-editor'

/**
 * The availability grid.
 *
 * Two orientations of the same data, chosen by viewport rather than by the user:
 *
 *   wide   hours run down, days across — the familiar calendar reading
 *   narrow days run down, hours across
 *
 * The narrow layout is not a reflow for space. It puts the drag axis at right
 * angles to the scroll axis, which is what removes the gesture conflict that
 * makes grids of this kind unusable on a phone: a horizontal drag cannot be
 * mistaken for a vertical scroll, so the page keeps scrolling normally and no
 * long-press, mode switch or scroll lock is needed.
 *
 * Keyboard support follows the ARIA grid pattern with a roving tabindex, so the
 * whole grid is one tab stop and the arrow keys move within it.
 */
type Orientation = 'hours-down' | 'hours-across'

type Focus = { date: string; hour: number }

export function AvailabilityGrid({
  editor,
  dates,
  gridStartHour,
  gridEndHour,
  minSessionHours,
  orientation,
  readOnly = false,
  timezone,
  onAnnounce,
}: {
  editor: AvailabilityEditor
  dates: readonly string[]
  gridStartHour: number
  gridEndHour: number
  minSessionHours: number
  orientation: Orientation
  readOnly?: boolean
  timezone: string
  onAnnounce: (message: string) => void
}) {
  const hours = Array.from(
    { length: gridEndHour - gridStartHour },
    (_, index) => gridStartHour + index,
  )

  const [focus, setFocus] = useState<Focus>({ date: dates[0] ?? '', hour: gridStartHour })
  const cellRefs = useRef(new Map<string, HTMLDivElement>())
  const gridRef = useRef<HTMLDivElement>(null)

  const key = (date: string, hour: number) => `${date}:${hour}`

  const moveFocus = useCallback(
    (date: string, hour: number) => {
      setFocus({ date, hour })
      cellRefs.current.get(key(date, hour))?.focus()
    },
    [],
  )

  /** Reads which cell a pointer is over; capture stops enter events firing. */
  const cellAt = useCallback((clientX: number, clientY: number): Focus | null => {
    const element = document.elementFromPoint(clientX, clientY)
    const cell = element?.closest<HTMLElement>('[data-date][data-hour]')
    if (!cell?.dataset['date'] || !cell.dataset['hour']) return null
    return { date: cell.dataset['date'], hour: Number(cell.dataset['hour']) }
  }, [])

  const handlePointerDown = useCallback(
    (date: string, hour: number) => (event: React.PointerEvent<HTMLDivElement>) => {
      if (readOnly) return

      event.preventDefault()
      gridRef.current?.setPointerCapture(event.pointerId)
      editor.beginDrag(date, hour)
      moveFocus(date, hour)
    },
    [editor, moveFocus, readOnly],
  )

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (readOnly || !editor.drag) return

      const target = cellAt(event.clientX, event.clientY)
      // A drag belongs to the day it began in; crossing into another does nothing.
      if (target && target.date === editor.drag.date) editor.extendDrag(target.hour)
    },
    [cellAt, editor, readOnly],
  )

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (readOnly || !editor.drag) return

      const drag = editor.drag
      gridRef.current?.releasePointerCapture(event.pointerId)

      /*
       * A press that never moved is a click, which means "free from here to the
       * end" — not a one-hour range. The drag has to be abandoned rather than
       * committed first, or the one-hour range it was previewing wins.
       */
      if (drag.anchorHour === drag.currentHour) {
        editor.cancelDrag()
        editor.toggleHour(drag.date, drag.anchorHour)
      } else {
        editor.endDrag()
      }

      const range = editor.rangeFor(drag.date)
      onAnnounce(describeRange(drag.date, range.state, range.fromHour, range.toHour, timezone))
    },
    [editor, onAnnounce, readOnly, timezone],
  )

  const handleKeyDown = useCallback(
    (date: string, hour: number) => (event: React.KeyboardEvent<HTMLDivElement>) => {
      const dateIndex = dates.indexOf(date)
      const hourIndex = hours.indexOf(hour)

      // Arrow semantics follow what the user sees, not how the data is stored.
      const movements: Record<string, [number, number]> =
        orientation === 'hours-down'
          ? { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }
          : { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }

      const movement = movements[event.key]

      if (movement) {
        event.preventDefault()
        const nextDate = dates[clamp(dateIndex + movement[0], 0, dates.length - 1)]
        const nextHour = hours[clamp(hourIndex + movement[1], 0, hours.length - 1)]

        if (nextDate === undefined || nextHour === undefined) return

        if (event.shiftKey && !readOnly && nextDate === date) {
          // Extend the range rather than only moving, the keyboard equivalent of a drag.
          if (!editor.drag) editor.beginDrag(date, hour)
          editor.extendDrag(nextHour)
        }

        moveFocus(nextDate, nextHour)
        return
      }

      if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault()
        const edge = event.key === 'Home' ? hours[0] : hours.at(-1)
        if (edge !== undefined) moveFocus(date, edge)
        return
      }

      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault()
        if (readOnly) return

        if (editor.drag) editor.endDrag()
        else editor.toggleHour(date, hour)

        const range = editor.rangeFor(date)
        onAnnounce(describeRange(date, range.state, range.fromHour, range.toHour, timezone))
      }
    },
    [dates, hours, orientation, editor, moveFocus, onAnnounce, readOnly, timezone],
  )

  const rows = orientation === 'hours-down' ? hours : dates
  const columns = orientation === 'hours-down' ? dates : hours

  return (
    <div
      ref={gridRef}
      role="grid"
      aria-multiselectable="true"
      aria-readonly={readOnly}
      aria-label={`Availability, times in ${timezone}`}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className={cn(
        'grid gap-1',
        // The drag axis is perpendicular to the scroll axis, so the browser can
        // keep the other one. Without this the page would not scroll at all.
        orientation === 'hours-across' ? 'touch-pan-y' : 'touch-none',
      )}
      style={{
        gridTemplateColumns: `auto repeat(${columns.length}, minmax(0, 1fr))`,
      }}
    >
      <div role="row" className="contents">
        {/*
          The corner cell must occupy its grid column. `sr-only` positions
          absolutely, which takes the element out of flow and shifts every
          column along by one — the axis labels then land on the wrong side.
        */}
        <div role="columnheader" aria-label={orientation === 'hours-down' ? 'Hour' : 'Date'} />
        {columns.map((column) => (
          <ColumnHeader
            key={String(column)}
            orientation={orientation}
            value={column}
            editor={editor}
            readOnly={readOnly}
          />
        ))}
      </div>

      {rows.map((row) => {
        const rowDate = orientation === 'hours-down' ? null : (row as string)
        const rowHour = orientation === 'hours-down' ? (row as number) : null

        return (
          <div role="row" key={String(row)} className="contents">
            <RowHeader
              orientation={orientation}
              value={row}
              editor={editor}
              readOnly={readOnly}
            />

            {columns.map((column) => {
              const date = rowDate ?? (column as string)
              const hour = rowHour ?? (column as number)
              const state = editor.stateAt(date, hour)
              const range = editor.rangeFor(date)

              return (
                <div key={key(date, hour)} data-date={date} data-hour={hour} className="h-9">
                  <GridCell
                    state={state}
                    selected={state !== null && state !== 'NO'}
                    focused={focus.date === date && focus.hour === hour}
                    tooShort={!rangeIsLongEnough(range, minSessionHours)}
                    label={describeCell(date, hour, state, timezone)}
                    onPointerDown={handlePointerDown(date, hour)}
                    onPointerEnter={() => {
                      if (editor.drag?.date === date) editor.extendDrag(hour)
                    }}
                    onKeyDown={handleKeyDown(date, hour)}
                    onFocus={() => setFocus({ date, hour })}
                    cellRef={(element) => {
                      if (element) cellRefs.current.set(key(date, hour), element)
                      else cellRefs.current.delete(key(date, hour))
                    }}
                  />
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

function ColumnHeader({
  orientation,
  value,
  editor,
  readOnly,
}: {
  orientation: Orientation
  value: string | number
  editor: AvailabilityEditor
  readOnly: boolean
}) {
  if (orientation === 'hours-down') {
    const date = value as string
    return (
      <DayHeader date={date} editor={editor} readOnly={readOnly} />
    )
  }

  return (
    <div
      role="columnheader"
      data-tabular
      className="pb-1 text-center font-ui text-2xs text-text-muted"
    >
      {String(value).padStart(2, '0')}
    </div>
  )
}

function RowHeader({
  orientation,
  value,
  editor,
  readOnly,
}: {
  orientation: Orientation
  value: string | number
  editor: AvailabilityEditor
  readOnly: boolean
}) {
  if (orientation === 'hours-down') {
    return (
      <div
        role="rowheader"
        data-tabular
        className="pr-2 text-right font-ui text-2xs leading-9 text-text-muted"
      >
        {String(value).padStart(2, '0')}:00
      </div>
    )
  }

  return <DayHeader date={value as string} editor={editor} readOnly={readOnly} asRow />
}

/**
 * Answers a whole day in one action.
 *
 * Also the keyboard and switch route past the grid: reaching an evening's answer
 * without stepping through eight cells.
 */
function DayHeader({
  date,
  editor,
  readOnly,
  asRow = false,
}: {
  date: string
  editor: AvailabilityEditor
  readOnly: boolean
  asRow?: boolean
}) {
  const range = editor.rangeFor(date)
  const parsed = new Date(`${date}T12:00:00Z`)

  const weekday = parsed.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })
  const day = parsed.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })

  return (
    <button
      type="button"
      role={asRow ? 'rowheader' : 'columnheader'}
      disabled={readOnly}
      onClick={() => editor.cycleDay(date)}
      aria-label={`${weekday} ${day}: ${describeState(range.state)}. Activate to change the whole day.`}
      className={cn(
        'rounded-sm px-1 font-ui text-2xs transition-interactive',
        'text-text-secondary hover:text-text-primary disabled:cursor-default',
        asRow ? 'flex flex-col items-start justify-center pr-2 text-left' : 'pb-1 text-center',
      )}
    >
      <span className="block font-medium">{weekday}</span>
      <span className="block text-text-muted">{day}</span>
    </button>
  )
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function describeState(state: SlotState | null): string {
  switch (state) {
    case 'YES':
      return 'free'
    case 'IF_NEED_BE':
      return 'free at a push'
    case 'NO':
      return 'not free'
    case null:
      return 'no answer yet'
  }
}

function describeCell(
  date: string,
  hour: number,
  state: SlotState | null,
  timezone: string,
): string {
  const day = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })

  // The zone is part of the accessible name: a time without one is how a group
  // spread across two countries turns up an hour apart.
  return `${day}, ${String(hour).padStart(2, '0')}:00 ${timezone}, ${describeState(state)}`
}

/**
 * What is announced after an edit.
 *
 * A completed answer, not a running commentary: announcing every cell during a
 * drag produces a stream nobody can follow.
 */
function describeRange(
  date: string,
  state: SlotState | null,
  fromHour: number,
  toHour: number,
  timezone: string,
): string {
  const day = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })

  if (state === null) return `${day}: answer cleared.`
  if (state === 'NO') return `${day}: marked not free.`

  const pad = (hour: number) => String(hour).padStart(2, '0')
  return `${day}: ${describeState(state)} from ${pad(fromHour)}:00 to ${pad(toHour)}:00 ${timezone}.`
}

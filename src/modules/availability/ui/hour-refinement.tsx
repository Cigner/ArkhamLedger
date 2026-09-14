'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/cn'
import { cellPresentation } from './grid-cell'
import type { AvailabilityEditor } from './use-availability-editor'

/**
 * Setting exact hours on a narrow screen.
 *
 * A twelve-hour grid fits across a phone only by shrinking each cell to about
 * twenty pixels — half the minimum touch target — so on this width the grid is
 * replaced rather than squeezed. Two selects per evening give proper targets, no
 * drag to conflict with scrolling, and the same underlying range.
 *
 * This is also the more honest control for what the refinement now is: a
 * property of one evening, not a region of a canvas.
 */
export function HourRefinementList({
  editor,
  dates,
  gridStartHour,
  gridEndHour,
  minSessionHours,
  readOnly,
  timezone,
  onAnnounce,
}: {
  editor: AvailabilityEditor
  dates: readonly string[]
  gridStartHour: number
  gridEndHour: number
  minSessionHours: number
  readOnly: boolean
  timezone: string
  onAnnounce: (message: string) => void
}) {
  const startOptions = Object.fromEntries(
    Array.from({ length: gridEndHour - gridStartHour }, (_, index) => {
      const hour = gridStartHour + index
      return [String(hour), `${String(hour).padStart(2, '0')}:00`]
    }),
  )

  const endOptions = Object.fromEntries(
    Array.from({ length: gridEndHour - gridStartHour }, (_, index) => {
      const hour = gridStartHour + index + 1
      return [String(hour), `${String(hour).padStart(2, '0')}:00`]
    }),
  )

  return (
    <ul className="flex flex-col gap-2">
      {dates.map((date) => {
        const range = editor.rangeFor(date)
        const presentation = cellPresentation(range.state)
        const parsed = new Date(`${date}T12:00:00Z`)
        const label = parsed.toLocaleDateString('en-GB', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          timeZone: 'UTC',
        })

        const answered = range.state === 'YES' || range.state === 'IF_NEED_BE'
        const tooShort = answered && range.toHour - range.fromHour < minSessionHours

        return (
          <li
            key={date}
            className={cn(
              'flex flex-col gap-2 rounded-sm border border-border-subtle bg-surface-subtle p-3',
              tooShort && 'border-status-warning/60',
            )}
          >
            <button
              type="button"
              disabled={readOnly}
              onClick={() => {
                editor.cycleDay(date)
                onAnnounce(`${label}: ${cellPresentation(editor.rangeFor(date).state).label}.`)
              }}
              className="flex min-h-11 items-center gap-3 text-left"
            >
              <span
                aria-hidden="true"
                className={cn(
                  'flex size-6 shrink-0 items-center justify-center rounded-sm text-sm',
                  presentation.className,
                )}
              >
                {presentation.glyph || '·'}
              </span>
              <span className="flex flex-1 flex-col">
                <span className="font-ui text-sm text-text-primary">{label}</span>
                <span className="font-ui text-xs text-text-muted">{presentation.label}</span>
              </span>
            </button>

            {answered ? (
              <div className="flex items-center gap-2">
                <span className="font-ui text-xs text-text-muted">from</span>
                <Select
                  items={startOptions}
                  value={String(range.fromHour)}
                  disabled={readOnly}
                  onValueChange={(value) => {
                    const from = Number(value)
                    editor.setRange(date, from, Math.max(range.toHour, from + 1))
                  }}
                >
                  <SelectTrigger className="h-11 w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(startOptions).map(([value, text]) => (
                      <SelectItem key={value} value={value}>
                        {text}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <span className="font-ui text-xs text-text-muted">until</span>
                <Select
                  items={endOptions}
                  value={String(range.toHour)}
                  disabled={readOnly}
                  onValueChange={(value) => {
                    const to = Number(value)
                    editor.setRange(date, Math.min(range.fromHour, to - 1), to)
                  }}
                >
                  <SelectTrigger className="h-11 w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(endOptions).map(([value, text]) => (
                      <SelectItem key={value} value={value}>
                        {text}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {tooShort ? (
              <p className="font-ui text-2xs text-status-warning">
                Shorter than the {minSessionHours} hours this session needs.
              </p>
            ) : null}

            <span className="sr-only">Times in {timezone}.</span>
          </li>
        )
      })}
    </ul>
  )
}

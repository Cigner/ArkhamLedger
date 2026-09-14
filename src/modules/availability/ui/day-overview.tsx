'use client'

import { cn } from '@/lib/cn'
import { cellPresentation } from './grid-cell'
import type { AvailabilityEditor } from './use-availability-editor'

/**
 * The default way to answer: one row per evening, no hours.
 *
 * Almost every answer is "yes that evening" or "no that evening". Asking people
 * to aim at an hour to say so makes the common case the fiddly one, and on a
 * phone it makes it the error-prone one too.
 *
 * Hours are a refinement, reached deliberately. A day that has been refined says
 * so here — "from 20:00" — so switching back to this view never hides an answer
 * the player gave.
 */
export function DayOverview({
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
  return (
    <ul className="flex flex-col gap-1.5">
      {dates.map((date) => {
        const range = editor.rangeFor(date)
        const presentation = cellPresentation(range.state)
        const parsed = new Date(`${date}T12:00:00Z`)

        const weekday = parsed.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' })
        const dayLabel = parsed.toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'long',
          timeZone: 'UTC',
        })

        const refined =
          range.state === 'YES' || range.state === 'IF_NEED_BE'
            ? range.fromHour !== gridStartHour || range.toHour !== gridEndHour
            : false

        const detail = describeDetail(range.state, range.fromHour, range.toHour, refined)
        const tooShort =
          (range.state === 'YES' || range.state === 'IF_NEED_BE') &&
          range.toHour - range.fromHour < minSessionHours

        return (
          <li key={date}>
            <button
              type="button"
              disabled={readOnly}
              onClick={() => {
                editor.cycleDay(date)
                const updated = editor.rangeFor(date)
                onAnnounce(
                  `${weekday} ${dayLabel}: ${describeState(updated.state)}. Times in ${timezone}.`,
                )
              }}
              aria-label={`${weekday} ${dayLabel}: ${describeState(range.state)}${detail ? `, ${detail}` : ''}. Activate to change.`}
              className={cn(
                // Comfortably above the 44px touch target minimum.
                'flex min-h-12 w-full items-center gap-3 rounded-sm border px-3 py-2 text-left',
                'transition-interactive disabled:cursor-default',
                range.state === null
                  ? 'border-border-subtle bg-surface-subtle hover:border-border-default'
                  : 'border-transparent',
                range.state !== null && presentation.className,
                tooShort && 'ring-1 ring-inset ring-status-warning',
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'flex size-6 shrink-0 items-center justify-center rounded-sm text-sm',
                  range.state === null ? 'text-text-muted' : 'text-current',
                )}
              >
                {presentation.glyph || '·'}
              </span>

              <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
                <span className="font-ui text-sm font-medium">{weekday}</span>
                <span className="font-ui text-xs opacity-80">{dayLabel}</span>
              </span>

              <span className="shrink-0 font-ui text-xs opacity-90" data-tabular>
                {detail || presentation.label}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function describeState(state: 'YES' | 'IF_NEED_BE' | 'NO' | null): string {
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

/**
 * Says when a refined day actually starts and ends.
 *
 * Only for days narrowed in the hourly view; a whole evening needs no detail,
 * and printing "16:00–24:00" on every row would bury the ones that differ.
 */
function describeDetail(
  state: 'YES' | 'IF_NEED_BE' | 'NO' | null,
  fromHour: number,
  toHour: number,
  refined: boolean,
): string {
  if (!refined || state === null || state === 'NO') return ''

  const pad = (hour: number) => String(hour).padStart(2, '0')
  return `${pad(fromHour)}:00 – ${pad(toHour)}:00`
}

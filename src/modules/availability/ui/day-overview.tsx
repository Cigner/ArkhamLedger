'use client'

import { cn } from '@/lib/cn'
import { cellPresentation } from './grid-cell'
import type { DayRange } from '../domain/types'
import type { AvailabilityEditor } from './use-availability-editor'

/**
 * The default way to answer: whole evenings, no hours.
 *
 * Laid out as a calendar on a wide screen and as a list on a narrow one. The
 * calendar is not decoration — it aligns every Monday in one column, so a month
 * of dates reads at a glance instead of as thirty near-identical rows, and it
 * turns a screenful of scrolling into five rows.
 *
 * Below about 768px the seven columns would fall under the minimum touch target,
 * so the list returns there; vertical scrolling is natural on a phone anyway.
 */
type Layout = 'calendar' | 'list'

/** Monday first: the week a European group actually plans around. */
function weekdayIndex(date: string): number {
  return (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7
}

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function DayOverview({
  editor,
  dates,
  gridStartHour,
  gridEndHour,
  minSessionHours,
  layout,
  readOnly,
  timezone,
  onAnnounce,
}: {
  editor: AvailabilityEditor
  dates: readonly string[]
  gridStartHour: number
  gridEndHour: number
  minSessionHours: number
  layout: Layout
  readOnly: boolean
  timezone: string
  onAnnounce: (message: string) => void
}) {
  const cell = (date: string) => (
    <DayButton
      key={date}
      date={date}
      editor={editor}
      gridStartHour={gridStartHour}
      gridEndHour={gridEndHour}
      minSessionHours={minSessionHours}
      layout={layout}
      readOnly={readOnly}
      timezone={timezone}
      onAnnounce={onAnnounce}
    />
  )

  if (layout === 'list') {
    return <ul className="flex flex-col gap-1.5">{dates.map((date) => cell(date))}</ul>
  }

  // Empty leading cells so the first date lands under its own weekday.
  const leadingBlanks = dates[0] ? weekdayIndex(dates[0]) : 0

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-7 gap-1.5">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="pb-1 text-center font-ui text-2xs uppercase tracking-[--tracking-smallcaps] text-text-muted"
          >
            {label}
          </div>
        ))}
      </div>

      <ul className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: leadingBlanks }, (_, index) => (
          <li key={`blank-${index}`} aria-hidden="true" />
        ))}
        {dates.map((date) => cell(date))}
      </ul>
    </div>
  )
}

function DayButton({
  date,
  editor,
  gridStartHour,
  gridEndHour,
  minSessionHours,
  layout,
  readOnly,
  timezone,
  onAnnounce,
}: {
  date: string
  editor: AvailabilityEditor
  gridStartHour: number
  gridEndHour: number
  minSessionHours: number
  layout: Layout
  readOnly: boolean
  timezone: string
  onAnnounce: (message: string) => void
}) {
  const range = editor.rangeFor(date)
  const presentation = cellPresentation(range.state)
  const parsed = new Date(`${date}T12:00:00Z`)

  const weekday = parsed.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' })
  const dayNumber = parsed.getUTCDate()
  const monthLabel = parsed.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })
  const fullDate = parsed.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })

  const refined = isRefined(range, gridStartHour, gridEndHour)
  const detail = refined ? formatRange(range.fromHour, range.toHour) : ''
  const tooShort =
    (range.state === 'YES' || range.state === 'IF_NEED_BE') &&
    range.toHour - range.fromHour < minSessionHours

  const label = `${weekday} ${fullDate}: ${presentation.label}${detail ? `, ${detail}` : ''}. Activate to change.`

  function handleClick() {
    editor.cycleDay(date)
    onAnnounce(
      `${weekday} ${fullDate}: ${cellPresentation(editor.rangeFor(date).state).label}. Times in ${timezone}.`,
    )
  }

  const shared = cn(
    'w-full rounded-sm border transition-interactive disabled:cursor-default',
    range.state === null
      ? 'border-border-subtle bg-surface-subtle hover:border-border-default'
      : cn('border-transparent', presentation.className),
    tooShort && 'ring-1 ring-inset ring-status-warning',
  )

  if (layout === 'list') {
    return (
      <li>
        <button
          type="button"
          disabled={readOnly}
          onClick={handleClick}
          aria-label={label}
          className={cn(shared, 'flex min-h-12 items-center gap-3 px-3 py-2 text-left')}
        >
          <span aria-hidden="true" className="w-5 shrink-0 text-center text-sm">
            {presentation.glyph || '·'}
          </span>
          <span className="flex flex-1 flex-wrap items-baseline gap-x-2">
            <span className="font-ui text-sm font-medium">{weekday}</span>
            <span className="font-ui text-xs opacity-80">{fullDate}</span>
          </span>
          <span data-tabular className="shrink-0 font-ui text-xs opacity-90">
            {detail || presentation.label}
          </span>
        </button>
      </li>
    )
  }

  return (
    <li>
      <button
        type="button"
        disabled={readOnly}
        onClick={handleClick}
        aria-label={label}
        className={cn(shared, 'flex min-h-16 flex-col items-start gap-0.5 px-2 py-1.5 text-left')}
      >
        <span className="flex w-full items-baseline justify-between gap-1">
          <span data-tabular className="font-ui text-sm font-medium leading-none">
            {dayNumber}
            {/* The month appears only where it changes, which is where it is needed. */}
            {dayNumber === 1 ? (
              <span className="ml-1 text-2xs font-normal opacity-80">{monthLabel}</span>
            ) : null}
          </span>
          <span aria-hidden="true" className="text-sm leading-none">
            {presentation.glyph}
          </span>
        </span>

        <span data-tabular className="font-ui text-2xs leading-tight opacity-85">
          {detail || (range.state === null ? '' : presentation.label)}
        </span>
      </button>
    </li>
  )
}

/**
 * Whether an evening has been narrowed in the hours view.
 *
 * A whole evening needs no detail; printing the full span on every cell would
 * bury the few that differ.
 */
function isRefined(range: DayRange, gridStartHour: number, gridEndHour: number): boolean {
  if (range.state !== 'YES' && range.state !== 'IF_NEED_BE') return false
  return range.fromHour !== gridStartHour || range.toHour !== gridEndHour
}

function formatRange(fromHour: number, toHour: number): string {
  const pad = (hour: number) => String(hour).padStart(2, '0')
  return `${pad(fromHour)}–${pad(toHour)}`
}

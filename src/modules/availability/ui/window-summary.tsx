import { cn } from '@/lib/cn'
import type { WindowSummary } from '../domain/types'

/**
 * The ranked windows.
 *
 * The answer rather than the working. A player opening this screen wants to know
 * whether the group can play and roughly when; reading that off a heatmap is
 * work the application can do for them.
 *
 * Counts only - no names appear in this shape at all.
 */
export function WindowSummaryList({
  windows,
  timezone,
  className,
}: {
  windows: readonly WindowSummary[]
  timezone: string
  className?: string
}) {
  if (windows.length === 0) {
    return (
      <p className={cn('font-ui text-sm text-text-muted', className)}>
        No evening yet has enough people free for long enough.
      </p>
    )
  }

  return (
    <ul className={cn('flex flex-col gap-1', className)}>
      {windows.map((window, index) => {
        const day = new Date(`${window.date}T12:00:00Z`).toLocaleDateString('en-GB', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          timeZone: 'UTC',
        })
        const pad = (hour: number) => String(hour).padStart(2, '0')
        const best = index === 0 && window.quorumMet

        return (
          <li
            key={`${window.date}-${window.startHour}`}
            className={cn(
              'flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-sm border px-3 py-2',
              best
                ? 'border-avail-best-ring bg-candle-a3'
                : 'border-border-subtle bg-surface-subtle',
            )}
          >
            {/* The best window is marked by a glyph and a border, not by colour alone. */}
            <span aria-hidden="true" className="font-ui text-sm text-candle-11">
              {best ? '✦' : '·'}
            </span>

            <span data-tabular className="font-ui text-sm text-text-primary">
              {day}, {pad(window.startHour)}:00 – {pad(window.endHour)}:00
            </span>

            <span data-tabular className="font-ui text-xs text-text-secondary">
              {window.available} of {window.total} free
              {window.ifNeedBe > 0 ? `, ${window.ifNeedBe} at a push` : ''}
            </span>

            <span
              className={cn(
                'font-ui text-2xs uppercase tracking-[--tracking-smallcaps]',
                window.quorumMet ? 'text-status-positive' : 'text-text-muted',
              )}
            >
              {window.quorumMet ? 'enough to play' : 'below quorum'}
            </span>

            <span className="sr-only">Times in {timezone}.</span>
          </li>
        )
      })}
    </ul>
  )
}

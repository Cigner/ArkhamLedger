import { formatWindow } from '@/lib/datetime/format'

/**
 * Renders when a session is, or when it might be.
 *
 * Always states the zone. A time without one is the single most reliable way for
 * a group spread across two countries to turn up an hour apart, and the cost of
 * saying it is four words.
 */

export function SessionWhen({
  confirmedStartUtc,
  confirmedEndUtc,
  searchWindowStart,
  searchWindowEnd,
  timezone,
}: {
  confirmedStartUtc: Date | null
  confirmedEndUtc: Date | null
  searchWindowStart: string
  searchWindowEnd: string
  timezone: string
}) {
  if (confirmedStartUtc && confirmedEndUtc) {
    return (
      <span data-tabular className="font-ui text-sm text-text-primary">
        <time dateTime={confirmedStartUtc.toISOString()}>
          {formatWindow(confirmedStartUtc, confirmedEndUtc, timezone)}
        </time>
        <span className="ml-2 text-xs text-text-muted">{timezone}</span>
      </span>
    )
  }

  const format = (value: string) =>
    new Date(`${value}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

  return (
    <span data-tabular className="font-ui text-sm text-text-secondary">
      Searching {format(searchWindowStart)} – {format(searchWindowEnd)}
    </span>
  )
}

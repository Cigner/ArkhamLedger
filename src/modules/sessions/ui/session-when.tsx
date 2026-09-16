import { formatWindow } from '@/lib/datetime/format'
import { getFormatter, getTranslations } from 'next-intl/server'

/**
 * Renders when a session is, or when it might be.
 *
 * Always states the zone. A time without one is the single most reliable way for
 * a group spread across two countries to turn up an hour apart, and the cost of
 * saying it is four words.
 */

export async function SessionWhen({
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
  const t = await getTranslations('sessions.when')
  const format = await getFormatter()
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

  return (
    <span data-tabular className="font-ui text-sm text-text-secondary">
      {t('searching', {
        start: format.dateTime(new Date(`${searchWindowStart}T12:00:00Z`), {
          day: 'numeric',
          month: 'short',
        }),
        end: format.dateTime(new Date(`${searchWindowEnd}T12:00:00Z`), {
          day: 'numeric',
          month: 'short',
        }),
      })}
    </span>
  )
}

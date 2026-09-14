import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { ButtonLink } from '@/components/ui/button-link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatWindow } from '@/lib/datetime/format'
import type { CampaignDiary } from '../domain/types'
import { SessionStatusBadge } from './session-status-badge'

/**
 * The one thing a campaign's dashboard is for.
 *
 * Campaigns do not usually end in an argument; they end because the evening
 * after the last one was never arranged, and by the time anybody notices, too
 * much time has passed to restart. So the absence of a next date is not rendered
 * as an empty space — it is the loudest thing on the page, and it carries the
 * action that fixes it.
 *
 * Three states, in the order they matter: a date is set, a date is being worked
 * out, or nothing is happening.
 */
export function NextSessionCard({
  diary,
  campaignId,
  isKeeper,
}: {
  diary: CampaignDiary
  campaignId: string
  isKeeper: boolean
}) {
  if (diary.next?.confirmedStartUtc && diary.next.confirmedEndUtc) {
    const next = diary.next

    return (
      <Card className="border-status-positive/40">
        <CardHeader>
          <CardTitle>Next session</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Link
              href={`/sessions/${next.id}`}
              className="font-display text-xl tracking-[--tracking-display] text-text-primary underline-offset-4 hover:underline"
            >
              {next.title}
            </Link>
            <span data-tabular className="font-ui text-sm text-text-secondary">
              <time dateTime={next.confirmedStartUtc!.toISOString()}>
                {formatWindow(next.confirmedStartUtc!, next.confirmedEndUtc!, next.timezone)}
              </time>
              <span className="ml-2 text-xs text-text-muted">{next.timezone}</span>
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            {/*
              A confirmed date that stays in this application is a date people
              forget. One press puts it in the calendar that already wakes them up.
            */}
            <ButtonLink href={`/api/sessions/${next.id}/ics`} variant="outline" size="sm">
              Add to calendar
            </ButtonLink>
            <ButtonLink href={`/sessions/${next.id}`} variant="ghost" size="sm">
              Open session
            </ButtonLink>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (diary.arranging.length > 0) {
    return (
      <Card className="border-candle-8">
        <CardHeader>
          <CardTitle>Being arranged</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="font-ui text-sm text-text-secondary">
            No date is settled yet. {isKeeper ? 'These are waiting on you or on answers.' : ''}
          </p>

          <ul className="flex flex-col gap-2">
            {diary.arranging.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-border-subtle bg-surface-subtle px-3 py-2"
              >
                <Link
                  href={`/sessions/${entry.id}`}
                  className="font-ui text-sm text-text-primary underline-offset-4 hover:underline"
                >
                  {entry.title}
                </Link>
                <SessionStatusBadge status={entry.status} />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-status-warning/50">
      <CardHeader>
        <CardTitle>No next session</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="font-ui text-sm text-text-secondary">
          Nothing is planned and nothing is being arranged. This is the state campaigns quietly
          end in — a fortnight becomes a month, and the thread is lost.
        </p>

        {isKeeper ? (
          <div>
            <ButtonLink
              href={`/campaigns/${campaignId}/sessions/new`}
              variant="accent"
              size="sm"
            >
              Plan the next one
            </ButtonLink>
          </div>
        ) : (
          <p className="font-ui text-xs text-text-muted">
            Your Keeper is the one who starts a session. A nudge in their direction usually does
            it.
          </p>
        )}

        {diary.recent.length > 0 ? (
          <div className="flex flex-col gap-1 border-t border-border-subtle pt-3">
            <p className="font-ui text-xs uppercase tracking-[--tracking-smallcaps] text-text-secondary">
              Last played
            </p>
            {diary.recent.map((entry) => (
              <span key={entry.id} className="font-ui text-sm text-text-muted">
                {entry.title}
                {entry.confirmedStartUtc ? (
                  <span data-tabular className="ml-2 text-xs">
                    {entry.confirmedStartUtc.toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'long',
                      timeZone: entry.timezone,
                    })}
                  </span>
                ) : null}
              </span>
            ))}
          </div>
        ) : (
          <Badge variant="muted">Nothing played yet</Badge>
        )}
      </CardContent>
    </Card>
  )
}

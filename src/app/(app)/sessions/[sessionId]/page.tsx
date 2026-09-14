import type { Metadata } from 'next'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getSessionDetail } from '@/modules/sessions/data/sessions'
import { KeeperActions } from '@/modules/sessions/ui/keeper-actions'
import { ResponseProgress } from '@/modules/sessions/ui/response-progress'
import { SessionWhen } from '@/modules/sessions/ui/session-when'

/**
 * Session overview.
 *
 * Rendered from one DTO that was already narrowed for the viewer: an
 * Investigator's copy carries no priorities and no per-person response times, so
 * there is no version of this page where those are present and merely unrendered.
 */
export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ sessionId: string }>
}): Promise<Metadata> {
  const { sessionId } = await params
  const session = await getSessionDetail(sessionId)
  return { title: session.title }
}

export default async function SessionOverviewPage({
  params,
}: {
  params: Promise<{ sessionId: string }>
}) {
  const { sessionId } = await params
  const session = await getSessionDetail(sessionId)

  const responded = session.participants.filter(
    (participant) => participant.respondedAt !== null,
  ).length

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="flex flex-col gap-6 lg:col-span-2">
        {session.status === 'CANCELLED' && session.cancelledReason ? (
          <Card className="border-status-danger/40">
            <CardHeader>
              <CardTitle>Cancelled</CardTitle>
            </CardHeader>
            <CardContent className="font-ui text-sm text-text-secondary">
              {session.cancelledReason}
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>When</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <SessionWhen
              confirmedStartUtc={session.confirmedStartUtc}
              confirmedEndUtc={session.confirmedEndUtc}
              searchWindowStart={session.searchWindowStart}
              searchWindowEnd={session.searchWindowEnd}
              timezone={session.timezone}
            />

            {session.availabilityDeadline && session.status === 'COLLECTING' ? (
              <p className="font-ui text-sm text-text-secondary">
                Answers close{' '}
                <time dateTime={session.availabilityDeadline.toISOString()}>
                  {session.availabilityDeadline.toLocaleString('en-GB', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: session.timezone,
                  })}
                </time>
              </p>
            ) : null}

            {session.status === 'COLLECTING' || session.status === 'PROPOSED' ? (
              <ResponseProgress responded={responded} total={session.participants.length} />
            ) : null}

            {session.viewer.isParticipant && session.status === 'COLLECTING' ? (
              <p className="font-ui text-sm text-text-secondary">
                {session.viewer.ownResponse
                  ? 'You have said when you are free.'
                  : 'You have not said when you are free yet.'}
                {session.viewer.ownPresenceRequired ? (
                  <span className="ml-1 text-candle-11">This session needs you.</span>
                ) : null}
              </p>
            ) : null}
          </CardContent>
        </Card>

        {session.description ? (
          <Card>
            <CardHeader>
              <CardTitle>What happens</CardTitle>
            </CardHeader>
            <CardContent className="font-body text-base leading-[--leading-body] text-text-secondary">
              {session.description}
            </CardContent>
          </Card>
        ) : null}

        {session.viewer.isKeeper ? (
          <Card>
            <CardHeader>
              <CardTitle>Keeper</CardTitle>
            </CardHeader>
            <CardContent>
              <KeeperActions session={session} />
            </CardContent>
          </Card>
        ) : null}
      </div>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle>Invited</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-3">
            {session.participants.map((participant) => (
              <li key={participant.userId} className="flex items-center justify-between gap-3">
                <span className="font-ui text-sm text-text-primary">
                  {participant.name}
                  {participant.userId === session.viewer.userId ? (
                    <span className="ml-2 text-xs text-text-muted">(you)</span>
                  ) : null}
                </span>

                {session.status === 'COMPLETED' ? (
                  <Badge variant={participant.attendance === 'ATTENDED' ? 'positive' : 'muted'}>
                    {participant.attendance === 'ATTENDED'
                      ? 'Was there'
                      : participant.attendance === 'ABSENT'
                        ? 'Missed it'
                        : 'Unknown'}
                  </Badge>
                ) : participant.isKeeper ? (
                  <Badge variant="candle">Keeper</Badge>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="mt-4 font-ui text-xs text-text-muted">
            {session.quorum} of {session.participants.length} have to be free for this to happen.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

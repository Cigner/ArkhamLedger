import { CircleAlert, CircleCheck, Cog, Send } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/cn'
import type { OperationsSnapshot } from '../domain/types'

/**
 * The health of the deployment, on one screen.
 *
 * Ordered by what an administrator would act on first: whether the worker is
 * alive, then whether anything is stuck, then the shape of what is running. The
 * two numbers that mean "something is wrong right now" - a stale worker and
 * overdue deadlines - are stated as sentences rather than left as figures to
 * interpret.
 */
export function OperationsPanel({ snapshot }: { snapshot: OperationsSnapshot }) {
  const beat = snapshot.worker.lastBeatAt

  return (
    <div className="flex flex-col gap-6">
      <Card className={snapshot.worker.stale ? 'border-status-danger/50' : undefined}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {snapshot.worker.stale ? (
              <CircleAlert className="size-4 text-status-danger" aria-hidden="true" />
            ) : (
              <Cog className="size-4 text-text-muted" aria-hidden="true" />
            )}
            Worker
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <p className="font-ui text-sm text-text-secondary">
            {snapshot.worker.stale
              ? 'Not reporting. Nothing is being delivered and no deadline will close until it is back.'
              : 'Running.'}
          </p>
          <p data-tabular className="font-ui text-xs text-text-muted">
            {beat ? (
              <>
                Last heartbeat <time dateTime={beat.toISOString()}>{formatUtc(beat)}</time> UTC
              </>
            ) : (
              'No heartbeat has ever been recorded.'
            )}
          </p>

          {snapshot.sessions.overdueDeadlines > 0 ? (
            <p className="font-ui text-sm text-status-warning">
              {snapshot.sessions.overdueDeadlines} session
              {snapshot.sessions.overdueDeadlines === 1 ? ' is' : 's are'} past a deadline that has
              not been closed.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Accounts" value={snapshot.accounts.total}>
          {snapshot.accounts.active} active · {snapshot.accounts.pendingActivation} awaiting
          activation · {snapshot.accounts.disabled} disabled
        </Metric>

        <Metric label="Campaigns" value={snapshot.campaigns.total}>
          {snapshot.campaigns.active} active
          {snapshot.campaigns.idle > 0 ? `, ${snapshot.campaigns.idle} with nothing planned` : ''}
        </Metric>

        <Metric
          label="Sessions being arranged"
          value={snapshot.sessions.collecting + snapshot.sessions.proposed}
        >
          {snapshot.sessions.collecting} collecting · {snapshot.sessions.proposed} awaiting a
          decision
        </Metric>

        <Metric label="Sessions ahead" value={snapshot.sessions.scheduledAhead}>
          Confirmed, still to come
        </Metric>
      </div>

      <Card className={snapshot.deliveries.failed > 0 ? 'border-status-warning/50' : undefined}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="size-4 text-text-muted" aria-hidden="true" />
            Delivery
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="font-ui text-sm text-text-secondary">
            {snapshot.deliveries.pending} waiting · {snapshot.deliveries.failed} given up on
          </p>

          {snapshot.deliveries.recentFailures.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {snapshot.deliveries.recentFailures.map((failure, index) => (
                <li
                  key={`${failure.at.toISOString()}-${index}`}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-sm border border-border-subtle bg-surface-subtle px-3 py-2"
                >
                  <Badge variant="muted">{failure.channel}</Badge>
                  <span className="font-ui text-xs text-text-secondary">{failure.error}</span>
                  <span data-tabular className="font-ui text-2xs text-text-muted">
                    {failure.attempts} attempts · {formatUtc(failure.at)} UTC
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="flex items-center gap-2 font-ui text-xs text-text-muted">
              <CircleCheck className="size-4 text-status-positive" aria-hidden="true" />
              Nothing has failed.
            </p>
          )}
        </CardContent>
      </Card>

      <p data-tabular className="font-ui text-2xs text-text-muted">
        Taken {formatUtc(snapshot.takenAt)} UTC
      </p>
    </div>
  )
}

function Metric({
  label,
  value,
  children,
  className,
}: {
  label: string
  value: number
  children?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-1 rounded-sm border border-border-subtle bg-surface-subtle px-4 py-3',
        className,
      )}
    >
      <span className="font-ui text-2xs uppercase tracking-[--tracking-smallcaps] text-text-secondary">
        {label}
      </span>
      <span data-tabular className="font-display text-2xl text-text-primary">
        {value}
      </span>
      {children ? <span className="font-ui text-xs text-text-muted">{children}</span> : null}
    </div>
  )
}

/**
 * Always UTC, and labelled as such.
 *
 * An operations screen is read next to a log and a container, both of which
 * speak UTC. Rendering it in a local zone would make comparing them a mental
 * arithmetic exercise at exactly the moment nobody wants one.
 */
function formatUtc(value: Date): string {
  return value.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  })
}

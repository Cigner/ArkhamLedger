import { CircleAlert, CircleCheck, Cog, Send } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
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
  const t = useTranslations('operations')
  const format = useFormatter()

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
            {t('worker.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <p className="font-ui text-sm text-text-secondary">
            {snapshot.worker.stale ? t('worker.stale') : t('worker.running')}
          </p>
          <p data-tabular className="font-ui text-xs text-text-muted">
            {beat ? (
              <>
                {t('worker.lastHeartbeat')}{' '}
                <time dateTime={beat.toISOString()}>{formatUtc(beat, format)}</time> {t('utc')}
              </>
            ) : (
              t('worker.never')
            )}
          </p>

          {snapshot.sessions.overdueDeadlines > 0 ? (
            <p className="font-ui text-sm text-status-warning">
              {t('worker.overdue', { count: snapshot.sessions.overdueDeadlines })}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label={t('metrics.accounts')} value={snapshot.accounts.total}>
          {t('metrics.accountsDetail', {
            active: snapshot.accounts.active,
            pending: snapshot.accounts.pendingActivation,
            disabled: snapshot.accounts.disabled,
          })}
        </Metric>

        <Metric label={t('metrics.campaigns')} value={snapshot.campaigns.total}>
          {t('metrics.campaignsDetail', {
            active: snapshot.campaigns.active,
            idle: snapshot.campaigns.idle,
          })}
        </Metric>

        <Metric
          label={t('metrics.arranging')}
          value={snapshot.sessions.collecting + snapshot.sessions.proposed}
        >
          {t('metrics.arrangingDetail', {
            collecting: snapshot.sessions.collecting,
            proposed: snapshot.sessions.proposed,
          })}
        </Metric>

        <Metric label={t('metrics.ahead')} value={snapshot.sessions.scheduledAhead}>
          {t('metrics.aheadDetail')}
        </Metric>
      </div>

      <Card className={snapshot.deliveries.failed > 0 ? 'border-status-warning/50' : undefined}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="size-4 text-text-muted" aria-hidden="true" />
            {t('delivery.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="font-ui text-sm text-text-secondary">
            {t('delivery.summary', {
              pending: snapshot.deliveries.pending,
              failed: snapshot.deliveries.failed,
            })}
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
                    {t('delivery.failure', {
                      attempts: failure.attempts,
                      date: formatUtc(failure.at, format),
                    })}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="flex items-center gap-2 font-ui text-xs text-text-muted">
              <CircleCheck className="size-4 text-status-positive" aria-hidden="true" />
              {t('delivery.none')}
            </p>
          )}
        </CardContent>
      </Card>

      <p data-tabular className="font-ui text-2xs text-text-muted">
        {t('taken', { date: formatUtc(snapshot.takenAt, format) })}
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
function formatUtc(value: Date, format: ReturnType<typeof useFormatter>): string {
  return format.dateTime(value, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  })
}

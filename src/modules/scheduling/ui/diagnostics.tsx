import { ButtonLink } from '@/components/ui/button-link'
import { useTranslations } from 'next-intl'
import type { RejectionSummary } from '../domain/types'
import { namesOf } from './format'

/**
 * Why no date worked.
 *
 * The screen that decides whether this tool is useful on a bad week. "No date
 * satisfies all constraints" is where Doodle leaves people; what a Keeper needs
 * is who to ring and what to change, so every sentence here names either a
 * person or a setting.
 */
export function SchedulingDiagnostics({
  summary,
  names,
  sessionId,
  respondentCount,
  participantCount,
}: {
  summary: RejectionSummary
  names: Readonly<Record<string, string>>
  sessionId: string
  respondentCount: number
  participantCount: number
}) {
  const t = useTranslations('scheduling.diagnostics')
  /*
   * Nobody answering looks identical to everybody refusing, and the algorithm
   * reports it as the Keeper being unavailable - technically true and useless.
   * Said plainly instead, because the remedy is completely different.
   */
  if (respondentCount === 0) {
    return (
      <Panel title={t('nobodyTitle')}>
        <p>{t('nobodyDescription', { count: participantCount })}</p>
        <ButtonLink href={`/sessions/${sessionId}/availability`} variant="outline" size="sm">
          {t('seeMissing')}
        </ButtonLink>
      </Panel>
    )
  }

  if (summary.windowsConsidered === 0) {
    return (
      <Panel title={t('tooShortTitle')}>
        <p>{t('tooShortDescription')}</p>
      </Panel>
    )
  }

  const blockers = summary.blockedBy.slice(0, 3)

  return (
    <Panel title={t('blockedTitle')}>
      <p>
        {t('allRuledOut', { count: summary.windowsConsidered })}
        {summary.byReason.KEEPER_UNAVAILABLE > 0
          ? t('keeperUnavailable', { count: summary.byReason.KEEPER_UNAVAILABLE })
          : ''}
        {summary.byReason.REQUIRED_UNAVAILABLE > 0
          ? t('requiredUnavailable', { count: summary.byReason.REQUIRED_UNAVAILABLE })
          : ''}
        {summary.byReason.QUORUM_NOT_MET > 0
          ? t('quorumMissed', {
              count: summary.byReason.QUORUM_NOT_MET,
              best: summary.bestAvailableCount,
              quorum: summary.quorum,
            })
          : ''}
      </p>

      {blockers.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {blockers.map((blocker) => (
            <li key={blocker.userId} className="font-ui text-sm text-text-secondary">
              <strong className="font-medium text-text-primary">
                {namesOf([blocker.userId], names)}
              </strong>{' '}
              {t('rulesOut', { count: blocker.windows })}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-col gap-1 border-t border-border-subtle pt-3">
        <p className="font-ui text-xs uppercase tracking-[--tracking-smallcaps] text-text-secondary">
          {t('whatCanChange')}
        </p>
        <ul className="list-disc pl-5 font-ui text-sm text-text-muted marker:text-text-muted">
          <li>{t('widerRange')}</li>
          {summary.byReason.QUORUM_NOT_MET > 0 ? (
            <li>
              {t('lowerQuorum', {
                from: summary.quorum,
                to: Math.max(1, summary.bestAvailableCount),
              })}
            </li>
          ) : null}
          {blockers.length > 0 ? (
            <li>{t('makeOptional', { name: namesOf([blockers[0]?.userId ?? ''], names) })}</li>
          ) : null}
          <li>{t('shorten')}</li>
        </ul>
      </div>
    </Panel>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-sm border border-status-warning/40 bg-surface-subtle px-4 py-4">
      <h2 className="font-display text-base tracking-[--tracking-display] text-text-primary">
        {title}
      </h2>
      <div className="flex flex-col gap-3 font-ui text-sm text-text-secondary">{children}</div>
    </section>
  )
}

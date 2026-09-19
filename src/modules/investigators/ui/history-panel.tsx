'use client'

import { useFormatter, useTranslations } from 'next-intl'
import Link from 'next/link'
import type { InvestigatorHistory } from '../data/history'
import type { SheetOptions } from '../data/sheet-options'
import { SessionComparison } from './session-comparison'

/**
 * Where this character has been.
 *
 * Section 9 asks the history tab for campaigns, sessions, snapshots and version
 * comparison alongside the resource journal. Each session carries what that
 * evening did, read from the pair of snapshots it took rather than from the
 * sheet as it stands now - a character who has since recovered still lost the
 * Sanity they lost that night.
 *
 * The snapshot list is deliberately plain. It is there so somebody can see that
 * a record exists and when it was taken, which is what makes the rest of this
 * believable.
 */
export function HistoryPanel({
  history,
  options,
}: {
  history: InvestigatorHistory
  options: SheetOptions
}) {
  const t = useTranslations('investigators.history')
  const format = useFormatter()

  const day = (value: Date): string =>
    format.dateTime(value, { day: '2-digit', month: '2-digit', year: 'numeric' })

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2 rounded-sm border border-border-subtle p-4">
        <h3 className="font-ui text-sm text-text-primary">{t('campaigns')}</h3>
        {history.campaigns.length === 0 ? (
          <p className="font-ui text-sm text-text-muted">{t('noCampaigns')}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {history.campaigns.map((entry) => (
              <li
                key={entry.campaignId}
                className="flex flex-wrap items-baseline gap-x-3 font-ui text-sm"
              >
                <span className="text-text-primary">{entry.name}</span>
                <span className="text-xs text-text-muted">
                  {entry.unlinkedAt
                    ? t('between', { from: day(entry.linkedAt), to: day(entry.unlinkedAt) })
                    : t('since', { from: day(entry.linkedAt) })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-sm border border-border-subtle p-4">
        <h3 className="font-ui text-sm text-text-primary">{t('sessions')}</h3>
        {history.sessions.length === 0 ? (
          <p className="font-ui text-sm text-text-muted">{t('noSessions')}</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {history.sessions.map((entry) => (
              <li key={entry.sessionId} className="flex flex-col gap-1">
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <Link
                    href={`/sessions/${entry.sessionId}`}
                    className="font-ui text-sm text-text-primary underline-offset-2 hover:underline"
                  >
                    {entry.title}
                  </Link>
                  <span className="text-xs text-text-muted">
                    {entry.campaignName}
                    {entry.playedAt ? ` · ${day(entry.playedAt)}` : ''}
                  </span>
                </div>

                {entry.comparison ? (
                  <SessionComparison
                    name={t('whatHappened')}
                    comparison={entry.comparison}
                    options={options}
                  />
                ) : (
                  <p className="font-ui text-xs text-text-muted">{t('noComparison')}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2 rounded-sm border border-border-subtle p-4">
        <h3 className="font-ui text-sm text-text-primary">{t('snapshots')}</h3>
        {history.snapshots.length === 0 ? (
          <p className="font-ui text-sm text-text-muted">{t('noSnapshots')}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {history.snapshots.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-baseline gap-x-3 font-ui text-sm">
                <span className="tabular-nums text-text-muted">{day(entry.createdAt)}</span>
                <span className="text-text-secondary">{t(`kinds.${entry.kind}`)}</span>
                {entry.sessionTitle ? (
                  <span className="text-xs text-text-muted">{entry.sessionTitle}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

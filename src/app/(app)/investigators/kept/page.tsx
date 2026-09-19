import type { Metadata } from 'next'
import Link from 'next/link'
import { getFormatter, getTranslations } from 'next-intl/server'
import { EmptyState } from '@/components/patterns/empty-state'
import { requireUser } from '@/lib/auth'
import { guardPage } from '@/lib/page-guards'
import { listKeptDisclosures } from '@/modules/investigators/data/snapshots'

/**
 * What you were shown and still keep.
 *
 * The visible half of permanent access. A Keeper whose campaign ended, or a
 * player who left one, keeps the characters exactly as they last saw them - and
 * until this page existed that promise was kept only in the database, which is a
 * promise to nobody.
 *
 * Characters still reachable live are marked rather than hidden, because the
 * difference between "I can still see this" and "this is a memory" is the whole
 * point of the page.
 */
export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('investigators.kept')
  return { title: t('title') }
}

export default async function KeptDisclosuresPage() {
  const t = await getTranslations('investigators.kept')
  const format = await getFormatter()

  const kept = await guardPage(async () => {
    const user = await requireUser()
    return listKeptDisclosures({ viewerId: user.id })
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl tracking-[--tracking-display] text-text-primary">
          {t('title')}
        </h1>
        <p className="font-ui text-sm text-text-secondary">{t('description')}</p>
      </div>

      {kept.length === 0 ? (
        <EmptyState title={t('emptyTitle')} description={t('emptyDescription')} />
      ) : (
        <ul className="flex flex-col gap-2">
          {kept.map((entry) => (
            <li key={entry.investigatorId}>
              <Link
                href={`/investigators/kept/${entry.investigatorId}`}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded-sm border border-border-subtle p-3 transition-interactive hover:border-border-strong"
              >
                <span className="font-ui text-sm text-text-primary">
                  {entry.name ?? t('unnamed')}
                  {entry.campaignName ? (
                    <span className="ml-2 text-text-muted">{entry.campaignName}</span>
                  ) : null}
                </span>
                <span className="font-ui text-xs text-text-muted">
                  {t(`reasons.${entry.reason}`)} ·{' '}
                  {format.dateTime(entry.disclosedAt, {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                  })}
                  {entry.stillReachable ? (
                    <span className="ml-2 text-status-positive">{t('stillLive')}</span>
                  ) : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

import type { Metadata } from 'next'
import Link from 'next/link'
import { getFormatter, getTranslations } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/patterns/page-header'
import { requireUser } from '@/lib/auth'
import { guardPage } from '@/lib/page-guards'
import { listOwnObservations } from '@/modules/investigators/data/notes'
import { buildSheetOptions } from '@/modules/investigators/data/sheet-options'
import { listDisclosuresFor, readKeptDisclosure } from '@/modules/investigators/data/snapshots'
import { PrintableSheet } from '@/modules/investigators/ui/printable-sheet'

/**
 * One character, as you last saw it.
 *
 * Rendered from the disclosure rather than from the character, so it cannot
 * accidentally show anything that happened afterwards. The printable layout is
 * reused deliberately: a frozen sheet is a document rather than a tool, and the
 * paper arrangement is what a document should look like.
 *
 * No guard beyond the disclosure itself. The row exists because this person was
 * shown this sheet; there is nothing further to authorize, and asking the live
 * character's guard would refuse them for exactly the reason they are here.
 */
export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('investigators.kept')
  return { title: t('title') }
}

export default async function KeptDisclosurePage({
  params,
  searchParams,
}: {
  params: Promise<{ investigatorId: string }>
  searchParams: Promise<{ at?: string }>
}) {
  const { investigatorId } = await params
  const { at } = await searchParams
  const t = await getTranslations('investigators.kept')
  const format = await getFormatter()

  const held = await guardPage(async () => {
    const user = await requireUser()
    const disclosure = await readKeptDisclosure({
      investigatorId,
      viewerId: user.id,
      snapshotId: at ?? null,
    })
    if (!disclosure) return null

    /*
     * Section 16: a player's observation remains available after leaving the
     * campaign. This is the only page they can still reach, so it is the only
     * place the promise can be kept.
     */
    return {
      disclosure,
      moments: await listDisclosuresFor({ investigatorId, viewerId: user.id }),
      observations: await listOwnObservations({ investigatorId, authorId: user.id }),
    }
  })

  if (!held) notFound()

  const { disclosure: kept, moments, observations } = held

  const options = buildSheetOptions({
    rulesetId: kept.sheet.rulesetId,
    rulesetVersion: kept.sheet.rulesetVersion,
    characteristics: kept.sheet.characteristics,
    occupationId: kept.sheet.identity.occupationId,
    occupationCharacteristic: kept.sheet.identity.occupationCharacteristic,
  })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={kept.sheet.identity.name ?? t('unnamed')}
        description={t('asOf', {
          date: format.dateTime(kept.disclosedAt, {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          }),
          reason: t(`reasons.${kept.reason}`),
        })}
      />
      {moments.length > 1 ? (
        <nav className="flex flex-wrap items-center gap-2 font-ui text-xs">
          <span className="text-text-muted">{t('moments')}</span>
          {moments.map((moment) => (
            <Link
              key={moment.id}
              href={`/investigators/kept/${investigatorId}?at=${moment.id}`}
              className={
                moment.disclosedAt.getTime() === kept.disclosedAt.getTime()
                  ? 'rounded-sm border border-border-strong px-2 py-1 text-text-primary'
                  : 'rounded-sm border border-border-subtle px-2 py-1 text-text-secondary hover:border-border-strong'
              }
            >
              {format.dateTime(moment.disclosedAt, {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
              })}{' '}
              · {t(`reasons.${moment.reason}`)}
            </Link>
          ))}
        </nav>
      ) : null}

      <PrintableSheet sheet={kept.sheet} options={options} />

      {observations.length > 0 ? (
        <section className="flex flex-col gap-3 rounded-sm border border-border-subtle p-4">
          <h2 className="font-display text-lg tracking-[--tracking-display] text-text-primary">
            {t('observations')}
          </h2>
          <ul className="flex flex-col gap-3">
            {observations.map((note) => (
              <li key={note.id} className="flex flex-col gap-1">
                <p className="whitespace-pre-line font-ui text-sm text-text-primary">
                  {note.content}
                </p>
                <p className="font-ui text-xs text-text-muted">
                  {format.dateTime(note.updatedAt, {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                  })}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

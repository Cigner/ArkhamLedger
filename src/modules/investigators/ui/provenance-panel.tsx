import { useFormatter, useTranslations } from 'next-intl'
import type { Provenance } from '../data/investigator-view'

/**
 * Where this character came from.
 *
 * A lineage only means something if somebody can see it: a character handed over
 * twice and branched once looks exactly like a fresh one until the history is
 * shown. None of this is private - who made a character and who has held it is
 * campaign knowledge rather than sheet contents.
 */
export function ProvenancePanel({ provenance }: { provenance: Provenance }) {
  const t = useTranslations('investigators.provenance')
  const methods = useTranslations('investigators.creationMethod')
  const format = useFormatter()

  return (
    <section className="flex flex-col gap-2 rounded-sm border border-border-subtle p-4">
      <h3 className="font-ui text-sm text-text-primary">{t('title')}</h3>

      <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
        <Row label={t('created')}>
          {t('createdBy', {
            date: format.dateTime(provenance.createdAt, {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
            }),
            who: provenance.creatorName ?? t('somebody'),
          })}
        </Row>
        <Row label={t('method')}>{methods(provenance.creationMethod)}</Row>
        <Row label={t('ruleset')}>
          {provenance.rulesetId} · {provenance.rulesetVersion}
        </Row>
        <Row label={t('heldBy')}>{provenance.ownerName}</Row>
      </dl>

      {provenance.branchedFrom ? (
        <p className="font-ui text-xs text-text-secondary">
          {t('branchedFrom', { name: provenance.branchedFrom.name ?? t('unnamed') })}
        </p>
      ) : null}

      {provenance.siblings > 0 ? (
        <p className="font-ui text-xs text-text-muted">
          {t('siblings', { count: provenance.siblings })}
        </p>
      ) : null}

      {provenance.transfers.length > 0 ? (
        <ul className="flex flex-col gap-0.5">
          {provenance.transfers.map((transfer, index) => (
            <li key={index} className="font-ui text-xs text-text-secondary">
              {t(`transfer.${transfer.status}`, {
                from: transfer.fromOwnerName,
                to: transfer.toOwnerName,
              })}
              {transfer.decidedAt ? (
                <span className="ml-2 text-text-muted">
                  {format.dateTime(transfer.decidedAt, {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                  })}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="font-ui text-xs uppercase tracking-[--tracking-smallcaps] text-text-muted">
        {label}
      </dt>
      <dd className="font-ui text-xs text-text-primary">{children}</dd>
    </div>
  )
}

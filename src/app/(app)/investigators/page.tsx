import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { EmptyState } from '@/components/patterns/empty-state'
import { ButtonLink } from '@/components/ui/button-link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { guardPage } from '@/lib/page-guards'
import { listOwnInvestigators } from '@/modules/investigators/data/campaign-bindings'
import { listIncomingTransfers } from '@/modules/investigators/data/transfers'
import { ImportDialog } from '@/modules/investigators/ui/import-dialog'
import { IncomingTransfers } from '@/modules/investigators/ui/incoming-transfers'
import { InvestigatorStatusBadge } from '@/modules/investigators/ui/investigator-status-badge'

/**
 * The Character Vault.
 *
 * Deliberately not scoped to a campaign: a character belongs to a person, and
 * the same one may be played in several games or in none yet. Drafts appear
 * here too, because an unfinished character that cannot be found again is an
 * abandoned one.
 */
export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('investigators.vault')
  return { title: t('title') }
}

export default async function VaultPage() {
  const t = await getTranslations('investigators.vault')
  const { characters, transfers } = await guardPage(async () => {
    const user = await requireUser()
    const [owned, pending] = await Promise.all([
      listOwnInvestigators(),
      listIncomingTransfers(user.id),
    ])
    return { characters: owned, transfers: pending }
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl tracking-[--tracking-display] text-text-primary">
          {t('title')}
        </h1>
        <div className="flex items-center gap-2">
          <ButtonLink href="/investigators/kept" variant="ghost">
            {t('kept')}
          </ButtonLink>
          <ImportDialog />
        </div>
      </div>

      <IncomingTransfers transfers={transfers} />

      {characters.length === 0 ? (
        <EmptyState title={t('emptyTitle')} description={t('emptyDescription')} />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {characters.map((character) => (
            <li key={character.investigatorId}>
              <Card className="h-full transition-interactive hover:border-border-strong">
                <Link href={`/investigators/${character.investigatorId}`} className="block">
                  <CardHeader className="flex flex-row items-start justify-between gap-3">
                    <CardTitle>{character.name ?? t('unnamed')}</CardTitle>
                    <InvestigatorStatusBadge status={character.status} />
                  </CardHeader>
                  <CardContent>
                    <p className="font-ui text-sm text-text-secondary">
                      {character.linkedCampaignIds.length === 0
                        ? t('noCampaign')
                        : t('inCampaigns', { count: character.linkedCampaignIds.length })}
                    </p>
                  </CardContent>
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

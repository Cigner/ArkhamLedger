import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/patterns/page-header'
import { guardPage } from '@/lib/page-guards'
import { getInvestigatorView } from '@/modules/investigators/data/investigator-view'
import { InvestigatorSheet } from '@/modules/investigators/ui/investigator-sheet'
import { InvestigatorStatusBadge } from '@/modules/investigators/ui/investigator-status-badge'

/**
 * One character.
 *
 * The same page whether it is being written or being played: a sheet somebody
 * may edit shows inputs, a sheet they may only read shows the same fields
 * without them. Which of those it is has already been decided by the data layer,
 * and the fields a reader may not see never arrive here at all.
 */
export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ investigatorId: string }>
}): Promise<Metadata> {
  const { investigatorId } = await params
  const t = await getTranslations('investigators.sheet')

  try {
    const view = await getInvestigatorView(investigatorId)
    return { title: view.sheet.identity.name ?? t('unnamed') }
  } catch {
    return { title: t('title') }
  }
}

export default async function InvestigatorPage({
  params,
}: {
  params: Promise<{ investigatorId: string }>
}) {
  const { investigatorId } = await params
  const t = await getTranslations('investigators.sheet')
  const view = await guardPage(() => getInvestigatorView(investigatorId))

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={view.sheet.identity.name ?? t('unnamed')}
        description={view.sheet.status === 'DRAFT' ? t('draftDescription') : undefined}
        actions={<InvestigatorStatusBadge status={view.sheet.status} />}
      />
      <InvestigatorSheet view={view} />
    </div>
  )
}

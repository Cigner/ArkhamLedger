import { CalendarPlus } from 'lucide-react'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/patterns/page-header'
import { guardPage } from '@/lib/page-guards'
import { requireKeeper } from '@/modules/campaigns/data/guards'
import { SessionDefinitionForm } from '@/modules/sessions/ui/session-definition-form'

/**
 * New session.
 *
 * Keeper-only, enforced by the guard rather than by the absence of a link.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('sessions.create')
  return { title: t('title') }
}
export const dynamic = 'force-dynamic'

export default async function NewSessionPage({
  params,
}: {
  params: Promise<{ campaignId: string }>
}) {
  const { campaignId } = await params
  const t = await getTranslations('sessions.create')
  await guardPage(() => requireKeeper(campaignId))

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={t('title')}
        icon={<CalendarPlus className="size-6" strokeWidth={1.5} />}
        description={t('description')}
      />
      <SessionDefinitionForm campaignId={campaignId} />
    </div>
  )
}

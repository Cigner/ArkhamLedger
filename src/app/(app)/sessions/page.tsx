import { CalendarDays } from 'lucide-react'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/patterns/page-header'
import { listMySessionShortcuts } from '@/modules/navigation/data/sidebar'
import { SessionOverview } from '@/modules/navigation/ui/session-overview'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('sessions.list')
  return { title: t('title') }
}

export default async function SessionsPage() {
  const t = await getTranslations('sessions.list')
  const sessions = await listMySessionShortcuts()

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={t('title')}
        icon={<CalendarDays className="size-6" strokeWidth={1.5} />}
        description={t('description')}
      />
      <SessionOverview sessions={sessions} />
    </div>
  )
}

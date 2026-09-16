import { Activity } from 'lucide-react'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/patterns/page-header'
import { getOperationsSnapshot } from '@/modules/operations/data/metrics'
import { OperationsPanel } from '@/modules/operations/ui/operations-panel'

/**
 * Operations.
 *
 * The screen somebody opens when they suspect something is wrong, so it leads
 * with the two things that are usually wrong: a worker that has stopped, and
 * messages nobody received.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin.operations')
  return { title: t('title') }
}
export const dynamic = 'force-dynamic'

export default async function AdminOverviewPage() {
  const t = await getTranslations('admin.operations')
  const snapshot = await getOperationsSnapshot(new Date())

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={t('title')}
        icon={<Activity className="size-6" strokeWidth={1.5} />}
        description={t('description')}
      />
      <OperationsPanel snapshot={snapshot} />
    </div>
  )
}

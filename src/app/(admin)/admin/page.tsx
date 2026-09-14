import type { Metadata } from 'next'
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
export const metadata: Metadata = { title: 'Operations' }
export const dynamic = 'force-dynamic'

export default async function AdminOverviewPage() {
  const snapshot = await getOperationsSnapshot(new Date())

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Operations"
        description="How this deployment is doing. Counts only — no campaign is named here."
      />
      <OperationsPanel snapshot={snapshot} />
    </div>
  )
}

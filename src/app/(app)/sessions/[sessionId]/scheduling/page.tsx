import type { Metadata } from 'next'
import { guardPage } from '@/lib/page-guards'
import { getSchedulingView } from '@/modules/scheduling/data/runs'
import { SchedulingPanel } from '@/modules/scheduling/ui/scheduling-panel'

/**
 * Dates.
 *
 * Keeper only, and the query is what enforces that: a proposal is read against
 * named availability, which is the Keeper's to see and nobody else's. An
 * Investigator following this URL is told the page does not exist.
 */
export const metadata: Metadata = { title: 'Dates' }
export const dynamic = 'force-dynamic'

export default async function SchedulingPage({
  params,
}: {
  params: Promise<{ sessionId: string }>
}) {
  const { sessionId } = await params
  const view = await guardPage(() => getSchedulingView(sessionId))

  return <SchedulingPanel view={view} />
}

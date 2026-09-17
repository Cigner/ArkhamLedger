import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { guardPage } from '@/lib/page-guards'
import { getSchedulingView } from '@/modules/scheduling/data/view'
import { SchedulingPanel } from '@/modules/scheduling/ui/scheduling-panel'

/**
 * Dates.
 *
 * Keeper only. A proposal is read against named availability.
 */
export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('scheduling.panel')
  return { title: t('title') }
}

export default async function SchedulingPage({
  params,
}: {
  params: Promise<{ sessionId: string }>
}) {
  const { sessionId } = await params
  const view = await guardPage(() => getSchedulingView(sessionId))

  return <SchedulingPanel view={view} />
}

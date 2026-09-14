import type { Metadata } from 'next'
import { PageHeader } from '@/components/patterns/page-header'
import { guardPage } from '@/lib/page-guards'
import { requireKeeper } from '@/modules/campaigns/data/guards'
import { CreateSessionForm } from '@/modules/sessions/ui/create-session-form'

/**
 * New session.
 *
 * Keeper-only, enforced by the guard rather than by the absence of a link.
 */
export const metadata: Metadata = { title: 'New session' }
export const dynamic = 'force-dynamic'

export default async function NewSessionPage({
  params,
}: {
  params: Promise<{ campaignId: string }>
}) {
  const { campaignId } = await params
  await guardPage(() => requireKeeper(campaignId))

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="New session"
        description="Starts as a draft. Nobody is asked anything until you open it for availability."
      />
      <CreateSessionForm campaignId={campaignId} />
    </div>
  )
}

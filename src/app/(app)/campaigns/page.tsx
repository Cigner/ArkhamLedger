import type { Metadata } from 'next'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/patterns/empty-state'
import { PageHeader } from '@/components/patterns/page-header'
import { requireUser } from '@/lib/auth'

/**
 * Campaign list.
 *
 * Placeholder until the campaigns module lands; it exists now so that every
 * redirect target in the authentication flow resolves to a real page.
 */
export const metadata: Metadata = { title: 'Campaigns' }

export default async function CampaignsPage() {
  await requireUser()

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Campaigns"
        description="Every campaign you keep or investigate."
        actions={<Button variant="accent" disabled>New campaign</Button>}
      />
      <EmptyState
        title="The archive is empty"
        description="Campaign management arrives in the next phase."
      />
    </div>
  )
}

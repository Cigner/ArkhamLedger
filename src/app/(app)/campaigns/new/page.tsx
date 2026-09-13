import type { Metadata } from 'next'
import { PageHeader } from '@/components/patterns/page-header'
import { requireUser } from '@/lib/auth'
import { CreateCampaignForm } from '@/modules/campaigns/ui/create-campaign-form'

export const metadata: Metadata = { title: 'New campaign' }

export default async function NewCampaignPage() {
  await requireUser()

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="New campaign"
        description="You will be its Keeper and its owner."
      />
      <CreateCampaignForm />
    </div>
  )
}

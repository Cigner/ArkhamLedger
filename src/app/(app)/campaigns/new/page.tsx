import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/patterns/page-header'
import { requireUser } from '@/lib/auth'
import { CreateCampaignForm } from '@/modules/campaigns/ui/create-campaign-form'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('campaigns.create')
  return { title: t('title') }
}

export default async function NewCampaignPage() {
  await requireUser()
  const t = await getTranslations('campaigns.create')

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={t('title')} description={t('description')} />
      <CreateCampaignForm />
    </div>
  )
}

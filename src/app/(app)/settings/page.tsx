import { Settings2 } from 'lucide-react'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/patterns/page-header'
import { requireUser } from '@/lib/auth'
import { guardPage } from '@/lib/page-guards'
import { SettingsForm } from '@/modules/identity/ui/settings-form'
import { getMyChannelPreferences } from '@/modules/notifications/data/preferences'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('identity.settings')
  return { title: t('title') }
}

export default async function SettingsPage() {
  const t = await getTranslations('identity.settings')
  const [user, preferences] = await guardPage(() =>
    Promise.all([requireUser(), getMyChannelPreferences()]),
  )

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('title')}
        icon={<Settings2 className="size-6" strokeWidth={1.5} />}
        description={t('pageDescription')}
      />
      <SettingsForm
        profile={{ name: user.name, timezone: user.timezone, email: user.email }}
        emailNotifications={preferences.EMAIL}
      />
    </div>
  )
}

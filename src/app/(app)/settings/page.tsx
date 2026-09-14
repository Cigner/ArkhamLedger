import type { Metadata } from 'next'
import { PageHeader } from '@/components/patterns/page-header'
import { requireUser } from '@/lib/auth'
import { guardPage } from '@/lib/page-guards'
import { SettingsForm } from '@/modules/identity/ui/settings-form'
import { getMyChannelPreferences } from '@/modules/notifications/data/preferences'

/**
 * Account settings.
 *
 * Everything here is about the signed-in user and nobody else; none of the
 * actions behind it accept a user id, so there is no version of this page that
 * could be pointed at somebody else's account.
 */
export const metadata: Metadata = { title: 'Settings' }
export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const [user, preferences] = await guardPage(() =>
    Promise.all([requireUser(), getMyChannelPreferences()]),
  )

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" description="Your details, and how you hear from us." />
      <SettingsForm
        profile={{ name: user.name, timezone: user.timezone, email: user.email }}
        emailNotifications={preferences.EMAIL}
      />
    </div>
  )
}

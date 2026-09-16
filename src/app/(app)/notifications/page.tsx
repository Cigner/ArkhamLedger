import { Bell } from 'lucide-react'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/patterns/page-header'
import { requireUser } from '@/lib/auth'
import { listInbox } from '@/modules/notifications/data/inbox'
import { NotificationList } from '@/modules/notifications/ui/notification-list'

/**
 * Notifications.
 *
 * Everything that happened, whether or not the email arrived. That is the point
 * of storing the event separately from its delivery: a relay that was down for
 * an hour is not a reason for somebody to never learn their session was moved.
 */
export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('notifications.inbox')
  return { title: t('title') }
}

export default async function NotificationsPage() {
  const t = await getTranslations('notifications.inbox')
  const [user, items] = await Promise.all([requireUser(), listInbox()])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('title')} icon={<Bell className="size-6" strokeWidth={1.5} />} />
      {/* Times in the reader's own zone: these are personal, not a campaign's. */}
      <NotificationList items={items} timezone={user.timezone} />
    </div>
  )
}

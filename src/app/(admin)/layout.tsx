import { AdminTabs } from '@/components/patterns/admin-tabs'
import { AppShell } from '@/modules/navigation/ui/app-shell'
import { requireAdmin } from '@/lib/auth'
import { guardPage } from '@/lib/page-guards'
import { countUnread } from '@/modules/notifications/data/inbox'
import { getSidebarNavigation } from '@/modules/navigation/data/sidebar'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await guardPage(() => requireAdmin())
  const [unreadCount, navigation] = await Promise.all([countUnread(), getSidebarNavigation()])

  return (
    <AppShell isAdmin userName={user.name} unreadCount={unreadCount} navigation={navigation}>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-8">
        <AdminTabs />
        {children}
      </main>
    </AppShell>
  )
}

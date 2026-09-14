import { AdminTabs } from '@/components/patterns/admin-tabs'
import { AppNav } from '@/components/patterns/app-nav'
import { requireAdmin } from '@/lib/auth'
import { guardPage } from '@/lib/page-guards'
import { countUnread } from '@/modules/notifications/data/inbox'

/**
 * Layout for the administration area.
 *
 * Calls requireAdmin, which throws rather than redirects: reaching this segment
 * without the role is not a navigation mistake to be smoothed over, and the
 * queries beneath enforce it again regardless.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await guardPage(() => requireAdmin())
  const unreadCount = await countUnread()

  return (
    <div className="relative z-10 flex min-h-dvh flex-col">
      <AppNav isAdmin userName={user.name} unreadCount={unreadCount} />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-8">
        <AdminTabs />
        {children}
      </main>
    </div>
  )
}

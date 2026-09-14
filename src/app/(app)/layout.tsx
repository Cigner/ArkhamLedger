import { redirect } from 'next/navigation'
import { AppNav } from '@/components/patterns/app-nav'
import { getOptionalUser } from '@/lib/auth'
import { countUnread } from '@/modules/notifications/data/inbox'

/**
 * Layout for the authenticated area.
 *
 * Reads the session server-side and redirects when it is absent. This is a real
 * check rather than the optimistic one in the proxy, but it is still not the
 * last line: every action and query re-verifies, because a layout guards what is
 * rendered and not what can be requested.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getOptionalUser()

  if (!user) redirect('/sign-in')

  const unreadCount = await countUnread()

  return (
    <div className="relative z-10 flex min-h-dvh flex-col">
      <AppNav isAdmin={user.role === 'admin'} userName={user.name} unreadCount={unreadCount} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">{children}</main>
    </div>
  )
}

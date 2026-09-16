import { redirect } from 'next/navigation'
import { AppShell } from '@/modules/navigation/ui/app-shell'
import { getOptionalUser } from '@/lib/auth'
import { countUnread } from '@/modules/notifications/data/inbox'
import { getSidebarNavigation } from '@/modules/navigation/data/sidebar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getOptionalUser()

  if (!user) redirect('/sign-in')

  const [unreadCount, navigation] = await Promise.all([countUnread(), getSidebarNavigation()])

  return (
    <AppShell
      isAdmin={user.role === 'admin'}
      userName={user.name}
      unreadCount={unreadCount}
      navigation={navigation}
    >
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">{children}</main>
    </AppShell>
  )
}

import { AppNav } from '@/components/patterns/app-nav'
import { requireAdmin } from '@/lib/auth'
import { guardPage } from '@/lib/page-guards'

/**
 * Layout for the administration area.
 *
 * Calls requireAdmin, which throws rather than redirects: reaching this segment
 * without the role is not a navigation mistake to be smoothed over, and the
 * queries beneath enforce it again regardless.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await guardPage(() => requireAdmin())

  return (
    <div className="relative z-10 flex min-h-dvh flex-col">
      <AppNav isAdmin userName={user.name} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">{children}</main>
    </div>
  )
}

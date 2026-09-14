'use client'

import { Bell } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { signOut } from '@/lib/auth/client'
import { cn } from '@/lib/cn'

/**
 * Primary navigation.
 *
 * Renders only the destinations the signed-in user can actually reach — the
 * administration link is omitted for everyone else rather than shown and
 * refused, since an offer the application will deny is worse than no offer.
 * Hiding it is presentation only; the route enforces the role itself.
 */
export function AppNav({
  isAdmin,
  userName,
  unreadCount,
}: {
  isAdmin: boolean
  userName: string
  unreadCount: number
}) {
  const pathname = usePathname()
  const router = useRouter()

  const links = [
    { href: '/campaigns', label: 'Campaigns' },
    ...(isAdmin ? [{ href: '/admin', label: 'Administration' }] : []),
  ]

  async function handleSignOut() {
    await signOut()
    router.push('/sign-in')
    router.refresh()
  }

  return (
    <header className="border-b border-border-subtle bg-surface-subtle">
      <nav className="mx-auto flex max-w-5xl items-center gap-6 px-6 py-3">
        <Link
          href="/campaigns"
          className="font-display text-base tracking-[--tracking-display] text-text-primary"
        >
          Arkham Ledger
        </Link>

        <ul className="flex flex-1 items-center gap-4">
          {links.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className={cn(
                  // Padded to a 24px target: a nav link is not inline text, so
                  // the exception that lets body links be small does not apply.
                  'flex min-h-6 items-center rounded-sm px-1 py-1 font-ui text-sm transition-interactive',
                  pathname.startsWith(link.href)
                    ? 'text-text-primary'
                    : 'text-text-secondary hover:text-text-primary',
                )}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        {/*
          The count is what the page load found. There is no live channel and no
          polling: a number that quietly ticks up while somebody reads is worth
          less than the request it costs, and every navigation refreshes it.
        */}
        <Link
          href="/notifications"
          aria-label={
            unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'
          }
          className={cn(
            'flex items-center gap-1.5 rounded-sm px-2 py-1 font-ui text-sm transition-interactive',
            pathname.startsWith('/notifications')
              ? 'text-text-primary'
              : 'text-text-secondary hover:text-text-primary',
          )}
        >
          <Bell className="size-4" aria-hidden="true" />
          {unreadCount > 0 ? (
            <span
              data-tabular
              className="rounded-full bg-accent-solid px-1.5 py-0.5 text-2xs font-medium text-text-on-accent"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          ) : null}
        </Link>

        <Link
          href="/settings"
          className={cn(
            'flex min-h-6 items-center rounded-sm px-1 py-1 font-ui text-sm transition-interactive',
            pathname.startsWith('/settings')
              ? 'text-text-primary'
              : 'text-text-secondary hover:text-text-primary',
          )}
        >
          <span className="hidden sm:inline">{userName}</span>
          <span className="sm:hidden">Settings</span>
        </Link>
        <Button variant="ghost" size="sm" onClick={() => void handleSignOut()}>
          Sign out
        </Button>
      </nav>
    </header>
  )
}

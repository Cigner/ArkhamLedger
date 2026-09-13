'use client'

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
export function AppNav({ isAdmin, userName }: { isAdmin: boolean; userName: string }) {
  const pathname = usePathname()
  const router = useRouter()

  const links = [
    { href: '/campaigns', label: 'Campaigns' },
    ...(isAdmin ? [{ href: '/admin/users', label: 'Administration' }] : []),
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
                  'font-ui text-sm transition-colors duration-[--duration-fast]',
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

        <span className="hidden font-ui text-xs text-text-muted sm:inline">{userName}</span>
        <Button variant="ghost" size="sm" onClick={() => void handleSignOut()}>
          Sign out
        </Button>
      </nav>
    </header>
  )
}

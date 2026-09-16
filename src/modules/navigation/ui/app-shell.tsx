'use client'

import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import {
  Bell,
  BookOpenText,
  CalendarDays,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Shield,
  X,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useFormatter, useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'
import { signOut } from '@/lib/auth/client'
import { IssueReportDialog } from '@/modules/feedback/ui/issue-report-dialog'
import { useSidebarStore } from '@/stores/sidebar'
import type { SidebarNavigation } from '../domain/types'

type AppShellProps = {
  readonly isAdmin: boolean
  readonly userName: string
  readonly unreadCount: number
  readonly navigation: SidebarNavigation
  readonly children: React.ReactNode
}

export function AppShell(props: AppShellProps) {
  const t = useTranslations('navigation')
  const [mobileOpen, setMobileOpen] = useState(false)
  const expanded = useSidebarStore((state) => state.expanded)
  const toggle = useSidebarStore((state) => state.toggle)

  useEffect(() => {
    void useSidebarStore.persist.rehydrate()
  }, [])

  useEdgeSwipe(mobileOpen, setMobileOpen)

  return (
    <div className="relative z-10 min-h-dvh">
      <Button
        variant="outline"
        size="icon"
        className="fixed left-4 top-4 z-sidebar md:hidden"
        aria-label={t('open')}
        onClick={() => setMobileOpen(true)}
      >
        <Menu aria-hidden="true" />
      </Button>

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-sidebar hidden border-r border-border-subtle bg-surface-subtle md:flex md:flex-col',
          'transition-[width] duration-[--duration-normal] ease-[--ease-out]',
          expanded ? 'w-72' : 'w-16',
        )}
      >
        <SidebarContent {...props} expanded={expanded} onToggle={toggle} />
      </aside>

      <DialogPrimitive.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Backdrop
            className={cn(
              'fixed inset-0 z-dialog bg-scrim transition-opacity md:hidden',
              'data-[open]:opacity-100 data-[closed]:opacity-0',
            )}
          />
          <DialogPrimitive.Popup
            className={cn(
              'fixed inset-y-0 left-0 z-dialog flex w-[min(20rem,calc(100vw-3rem))] flex-col',
              'border-r border-border-default bg-surface-overlay md:hidden',
              'data-[open]:animate-in data-[open]:slide-in-from-left',
              'data-[closed]:animate-out data-[closed]:slide-out-to-left',
            )}
          >
            <DialogPrimitive.Title className="sr-only">{t('title')}</DialogPrimitive.Title>
            <SidebarContent {...props} expanded mobile onClose={() => setMobileOpen(false)} />
          </DialogPrimitive.Popup>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <div
        className={cn(
          'min-h-dvh pt-16 transition-[padding] duration-[--duration-normal] ease-[--ease-out] md:pt-0',
          expanded ? 'md:pl-72' : 'md:pl-16',
        )}
      >
        {props.children}
      </div>
    </div>
  )
}

function SidebarContent({
  isAdmin,
  userName,
  unreadCount,
  navigation,
  expanded,
  mobile = false,
  onToggle,
  onClose,
}: Omit<AppShellProps, 'children'> & {
  expanded: boolean
  mobile?: boolean
  onToggle?: (() => void) | undefined
  onClose?: (() => void) | undefined
}) {
  const pathname = usePathname()
  const router = useRouter()
  const t = useTranslations('navigation')
  const format = useFormatter()

  async function handleSignOut() {
    await signOut()
    router.push('/sign-in')
    router.refresh()
  }

  return (
    <>
      <div className="flex h-16 shrink-0 items-center border-b border-border-subtle px-3">
        <Link
          href="/campaigns"
          className={cn(
            'flex min-w-0 items-center gap-3 rounded-sm px-1 text-text-primary transition-interactive',
            !expanded && 'mx-auto',
          )}
          aria-label={t('appName')}
        >
          <BookOpenText className="size-6 shrink-0 text-candle-11" aria-hidden="true" />
          {expanded ? (
            <span className="truncate font-display text-sm tracking-[--tracking-display]">
              {t('appName')}
            </span>
          ) : null}
        </Link>
        {mobile ? (
          <DialogPrimitive.Close
            render={<Button variant="ghost" size="icon-sm" className="ml-auto" />}
            aria-label={t('close')}
          >
            <X aria-hidden="true" />
          </DialogPrimitive.Close>
        ) : null}
      </div>

      <nav
        aria-label={t('primary')}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 py-3"
      >
        <SidebarLink
          href="/campaigns"
          label={t('campaigns')}
          icon={BookOpenText}
          active={pathname.startsWith('/campaigns')}
          expanded={expanded}
          onNavigate={onClose}
        />
        {expanded ? (
          <ShortcutList>
            {navigation.campaigns.map((item) => (
              <ShortcutLink
                key={item.id}
                href={`/campaigns/${item.id}`}
                label={item.name}
                detail={campaignDetail(item.activity, item.activityAt, t, format)}
                onNavigate={onClose}
              />
            ))}
          </ShortcutList>
        ) : null}

        <SidebarLink
          href="/sessions"
          label={t('sessions')}
          icon={CalendarDays}
          active={pathname.startsWith('/sessions')}
          expanded={expanded}
          onNavigate={onClose}
          className={expanded ? 'mt-3' : 'mt-1'}
        />
        {expanded ? (
          <ShortcutList>
            {navigation.sessions.map((item) => (
              <ShortcutLink
                key={item.id}
                href={`/sessions/${item.id}`}
                label={item.title}
                detail={sessionDetail(item, t, format)}
                onNavigate={onClose}
              />
            ))}
          </ShortcutList>
        ) : null}

        <div className="mt-3 border-t border-border-subtle pt-3">
          <SidebarLink
            href="/notifications"
            label={t('notifications')}
            icon={Bell}
            active={pathname.startsWith('/notifications')}
            expanded={expanded}
            badge={unreadCount}
            onNavigate={onClose}
          />
          {isAdmin ? (
            <SidebarLink
              href="/admin"
              label={t('administration')}
              icon={Shield}
              active={pathname.startsWith('/admin')}
              expanded={expanded}
              onNavigate={onClose}
            />
          ) : null}
        </div>
      </nav>

      <div className="flex shrink-0 flex-col gap-1 border-t border-border-subtle p-2">
        <IssueReportDialog compact={!expanded} />
        <SidebarLink
          href="/settings"
          label={expanded ? userName : t('settings')}
          accessibleLabel={t('settings')}
          icon={Settings}
          active={pathname.startsWith('/settings')}
          expanded={expanded}
          onNavigate={onClose}
        />
        <Button
          variant="ghost"
          size={expanded ? 'md' : 'icon'}
          className={cn(
            'min-h-11 w-full gap-3 rounded-sm px-3',
            expanded ? 'justify-start' : 'justify-center px-0',
          )}
          aria-label={expanded ? undefined : t('signOut')}
          title={expanded ? undefined : t('signOut')}
          onClick={() => void handleSignOut()}
        >
          <LogOut className="size-5" aria-hidden="true" />
          {expanded ? t('signOut') : null}
        </Button>
        {!mobile ? (
          <Button
            variant="ghost"
            size={expanded ? 'md' : 'icon'}
            className={cn(
              'mt-1 min-h-11 w-full gap-3 rounded-sm border-t border-border-subtle px-3',
              expanded ? 'justify-start' : 'justify-center px-0',
            )}
            aria-label={expanded ? t('collapse') : t('expand')}
            title={expanded ? undefined : t('expand')}
            onClick={onToggle}
          >
            {expanded ? (
              <PanelLeftClose className="size-5" aria-hidden="true" />
            ) : (
              <PanelLeftOpen className="size-5" aria-hidden="true" />
            )}
            {expanded ? t('collapse') : null}
          </Button>
        ) : null}
      </div>
    </>
  )
}

function SidebarLink({
  href,
  label,
  accessibleLabel,
  icon: Icon,
  active,
  expanded,
  badge = 0,
  onNavigate,
  className,
}: {
  href: string
  label: string
  accessibleLabel?: string
  icon: typeof Bell
  active: boolean
  expanded: boolean
  badge?: number
  onNavigate?: (() => void) | undefined
  className?: string
}) {
  return (
    <Link
      href={href}
      {...(onNavigate ? { onClick: onNavigate } : {})}
      aria-current={active ? 'page' : undefined}
      aria-label={!expanded ? (accessibleLabel ?? label) : undefined}
      title={!expanded ? (accessibleLabel ?? label) : undefined}
      className={cn(
        'relative flex min-h-11 items-center gap-3 rounded-sm px-3 font-ui text-sm transition-interactive',
        active
          ? 'bg-candle-a5 text-text-primary'
          : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary active:bg-surface-active',
        !expanded && 'justify-center px-0',
        className,
      )}
    >
      <Icon className="size-5 shrink-0" aria-hidden="true" />
      {expanded ? <span className="truncate">{label}</span> : null}
      {badge > 0 ? (
        <span
          data-tabular
          className={cn(
            'rounded-full bg-accent-solid px-1.5 py-0.5 text-2xs font-medium text-text-on-accent',
            expanded ? 'ml-auto' : 'absolute right-0.5 top-0.5',
          )}
        >
          {badge > 99 ? '99+' : badge}
        </span>
      ) : null}
    </Link>
  )
}

function ShortcutList({ children }: { children: React.ReactNode }) {
  return <ul className="ml-5 border-l border-border-subtle py-1 pl-3">{children}</ul>
}

function ShortcutLink({
  href,
  label,
  detail,
  onNavigate,
}: {
  href: string
  label: string
  detail: string
  onNavigate?: (() => void) | undefined
}) {
  return (
    <li>
      <Link
        href={href}
        {...(onNavigate ? { onClick: onNavigate } : {})}
        className="flex min-h-10 flex-col justify-center rounded-sm px-2 py-1 transition-interactive hover:bg-surface-hover active:bg-surface-active"
      >
        <span className="truncate font-ui text-xs text-text-secondary">{label}</span>
        <span className="truncate font-ui text-2xs text-text-muted">{detail}</span>
      </Link>
    </li>
  )
}

function campaignDetail(
  activity: SidebarNavigation['campaigns'][number]['activity'],
  at: string,
  t: ReturnType<typeof useTranslations>,
  format: ReturnType<typeof useFormatter>,
): string {
  if (activity === 'ARRANGING') return t('shortcuts.planning')
  if (activity === 'UPCOMING') return t('shortcuts.next', { date: shortDate(at, format) })
  if (activity === 'RECENT') return t('shortcuts.played', { date: shortDate(at, format) })
  return t('shortcuts.campaign')
}

function sessionDetail(
  item: SidebarNavigation['sessions'][number],
  t: ReturnType<typeof useTranslations>,
  format: ReturnType<typeof useFormatter>,
): string {
  if (item.confirmedStartUtc) {
    return `${item.campaignName} · ${shortDate(item.confirmedStartUtc, format)}`
  }
  if (item.status === 'COLLECTING')
    return t('shortcuts.collecting', { campaign: item.campaignName })
  if (item.status === 'PROPOSED') return t('shortcuts.choosing', { campaign: item.campaignName })
  return t('shortcuts.sessionStatus', {
    campaign: item.campaignName,
    status: t(`statuses.${item.status}`),
  })
}

function shortDate(value: string, format: ReturnType<typeof useFormatter>): string {
  return format.dateTime(new Date(value), {
    day: 'numeric',
    month: 'short',
    timeZone: 'Europe/Warsaw',
  })
}

function useEdgeSwipe(open: boolean, setOpen: (open: boolean) => void) {
  const start = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') return
      if (!open && event.clientX > 24) return
      start.current = { x: event.clientX, y: event.clientY }
    }

    const onPointerMove = (event: PointerEvent) => {
      if (!start.current) return
      const horizontal = event.clientX - start.current.x
      const vertical = Math.abs(event.clientY - start.current.y)
      if (vertical > Math.abs(horizontal)) {
        start.current = null
        return
      }
      if (!open && horizontal > 56) {
        setOpen(true)
        start.current = null
      } else if (open && horizontal < -56) {
        setOpen(false)
        start.current = null
      }
    }

    const reset = () => {
      start.current = null
    }

    window.addEventListener('pointerdown', onPointerDown, { passive: true })
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('pointerup', reset, { passive: true })
    window.addEventListener('pointercancel', reset, { passive: true })

    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', reset)
      window.removeEventListener('pointercancel', reset)
    }
  }, [open, setOpen])
}

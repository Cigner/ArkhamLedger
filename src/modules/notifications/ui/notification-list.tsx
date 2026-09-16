'use client'

import {
  BellOff,
  CalendarCheck,
  CalendarClock,
  CalendarPlus,
  CalendarX,
  CheckCheck,
  Clock3,
  ListChecks,
  MessageSquareWarning,
  UserPlus,
  Users,
} from 'lucide-react'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useFormatter, useTranslations } from 'next-intl'
import { useAction } from 'next-safe-action/hooks'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/patterns/empty-state'
import { cn } from '@/lib/cn'
import { markAllNotificationsRead, markNotificationsRead } from '../actions/notifications'
import type { InboxItem, NotificationType } from '../domain/types'

/**
 * One icon per kind of event.
 *
 * An inbox is read by scanning, and the shape of a line tells you what it is
 * about before the words do. Decorative: the subject says the same thing.
 */
const ICONS: Record<NotificationType, typeof CalendarCheck> = {
  CAMPAIGN_INVITED: UserPlus,
  CAMPAIGN_MEMBER_JOINED: Users,
  SESSION_CREATED: CalendarPlus,
  AVAILABILITY_REQUESTED: CalendarClock,
  AVAILABILITY_REMINDER: Clock3,
  COLLECTION_CLOSED: ListChecks,
  SESSION_SCHEDULED: CalendarCheck,
  SESSION_RESCHEDULED: CalendarClock,
  SESSION_CANCELLED: CalendarX,
  NO_NEXT_SESSION: BellOff,
  ISSUE_REPORTED: MessageSquareWarning,
}

/**
 * The inbox.
 *
 * Grouped by day and marked read on opening rather than on hovering: a list that
 * clears itself as the eye passes over it loses the one thing it is for, which
 * is coming back to something you have not dealt with yet.
 */
export function NotificationList({
  items,
  timezone,
}: {
  items: readonly InboxItem[]
  /*
   * Stated rather than inferred. Without it the server formats in its own zone
   * and the browser in the reader's, React finds two different strings for the
   * same element, and the page is thrown away and re-rendered on every load.
   */
  timezone: string
}) {
  const router = useRouter()
  const t = useTranslations('notifications.inbox')
  const format = useFormatter()
  const [busy, setBusy] = useState(false)

  const markOne = useAction(markNotificationsRead, { onSuccess: () => router.refresh() })
  const markAll = useAction(markAllNotificationsRead, {
    onSuccess: () => {
      setBusy(false)
      router.refresh()
    },
    onError: () => setBusy(false),
  })

  const unread = items.filter((item) => item.readAt === null)

  if (items.length === 0) {
    return (
      <EmptyState
        title={t('emptyTitle')}
        icon={<BellOff className="size-8" strokeWidth={1.25} />}
        description={t('emptyDescription')}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-ui text-sm text-text-secondary">
          {unread.length === 0
            ? t('nothingUnread')
            : t('unread', { unread: unread.length, total: items.length })}
        </p>

        {unread.length > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => {
              setBusy(true)
              markAll.execute()
            }}
          >
            <CheckCheck className="size-4" aria-hidden="true" />
            {t('markAllRead')}
          </Button>
        ) : null}
      </div>

      <ul className="flex flex-col gap-2">
        {items.map((item) => {
          const isUnread = item.readAt === null

          const Icon = ICONS[item.type]

          const content = (
            <>
              <span className="flex items-baseline justify-between gap-3">
                <span className="flex items-baseline gap-2 font-ui text-sm font-medium text-text-primary">
                  <Icon
                    className="size-4 shrink-0 translate-y-0.5 text-text-muted"
                    aria-hidden="true"
                  />
                  {item.title}
                </span>
                <time
                  dateTime={item.createdAt.toISOString()}
                  data-tabular
                  className="shrink-0 font-ui text-xs text-text-muted"
                >
                  {format.dateTime(item.createdAt, {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: timezone,
                  })}
                </time>
              </span>
              <span className="pl-6 font-ui text-xs text-text-secondary">{item.body}</span>
            </>
          )

          const className = cn(
            'flex w-full flex-col gap-1 rounded-sm border px-4 py-3 text-left transition-interactive',
            isUnread
              ? 'border-candle-8 bg-candle-a3'
              : 'border-border-subtle bg-surface-subtle hover:border-border-default',
          )

          return (
            <li key={item.id}>
              {item.href ? (
                <Link
                  href={item.href}
                  className={className}
                  onClick={() => {
                    if (isUnread) markOne.execute({ ids: [item.id] })
                  }}
                >
                  {content}
                </Link>
              ) : (
                <button
                  type="button"
                  className={className}
                  disabled={!isUnread}
                  onClick={() => markOne.execute({ ids: [item.id] })}
                >
                  {content}
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

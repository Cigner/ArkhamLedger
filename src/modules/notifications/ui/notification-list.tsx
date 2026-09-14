'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAction } from 'next-safe-action/hooks'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/patterns/empty-state'
import { cn } from '@/lib/cn'
import { markAllNotificationsRead, markNotificationsRead } from '../actions/notifications'
import type { InboxItem } from '../domain/types'

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
        title="Nothing has happened yet"
        description="Invitations, availability requests and confirmed dates all arrive here."
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-ui text-sm text-text-secondary">
          {unread.length === 0
            ? 'Nothing unread.'
            : `${unread.length} unread of ${items.length}.`}
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
            Mark all as read
          </Button>
        ) : null}
      </div>

      <ul className="flex flex-col gap-2">
        {items.map((item) => {
          const isUnread = item.readAt === null

          const content = (
            <>
              <span className="flex items-baseline justify-between gap-3">
                <span className="font-ui text-sm font-medium text-text-primary">{item.title}</span>
                <time
                  dateTime={item.createdAt.toISOString()}
                  data-tabular
                  className="shrink-0 font-ui text-xs text-text-muted"
                >
                  {item.createdAt.toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: timezone,
                  })}
                </time>
              </span>
              <span className="font-ui text-xs text-text-secondary">{item.body}</span>
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

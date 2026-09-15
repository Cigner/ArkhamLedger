import 'server-only'
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { db } from '@/db/client'
import { notification } from '@/db/schema'
import { requireUser } from '@/lib/auth'
import { env } from '@/lib/env'
import { renderNotification } from '../domain/messages'
import type { InboxItem, NotificationPayload } from '../domain/types'

/**
 * Somebody's own notifications.
 *
 * Every query here is narrowed by the session's identity rather than by an
 * argument - an inbox is the most personal thing in the application, and there
 * is no shape of input that could point one of these at another person's rows.
 */
/**
 * The signed-in user's inbox, rendered.
 *
 * Rendering here rather than in the component means the same wording reaches the
 * bell, the list and the email from one place, and the payload never has to be
 * understood twice.
 */
export async function listInbox(limit = 50): Promise<InboxItem[]> {
  const user = await requireUser()

  const rows = await db
    .select()
    .from(notification)
    .where(eq(notification.userId, user.id))
    .orderBy(desc(notification.createdAt))
    .limit(limit)

  return rows.map((row) => {
    const rendered = renderNotification({
      type: row.type,
      payload: row.payload as NotificationPayload,
      recipientName: user.name,
      baseUrl: env.BETTER_AUTH_URL,
      campaignId: row.campaignId,
      gameSessionId: row.gameSessionId,
    })

    return {
      id: row.id,
      type: row.type,
      title: rendered.subject,
      // The stored link is relative; the absolute one belongs in email only.
      body: rendered.body.split('\n\n')[0] ?? rendered.body,
      href: rendered.href,
      readAt: row.readAt,
      createdAt: row.createdAt,
    }
  })
}

export async function countUnread(): Promise<number> {
  const user = await requireUser()

  const [row] = await db
    .select({ total: sql<number>`count(*)` })
    .from(notification)
    .where(and(eq(notification.userId, user.id), isNull(notification.readAt)))

  return Number(row?.total ?? 0)
}

/** Marks notifications read. Scoped to the caller's own rows by the WHERE clause. */
export async function markRead(ids: readonly string[], now: Date): Promise<void> {
  const user = await requireUser()
  if (ids.length === 0) return

  await db
    .update(notification)
    .set({ readAt: now, updatedAt: now })
    .where(
      and(
        eq(notification.userId, user.id),
        inArray(notification.id, [...ids]),
        isNull(notification.readAt),
      ),
    )
}

export async function markAllRead(now: Date): Promise<void> {
  const user = await requireUser()

  await db
    .update(notification)
    .set({ readAt: now, updatedAt: now })
    .where(and(eq(notification.userId, user.id), isNull(notification.readAt)))
}

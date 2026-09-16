import { CalendarX } from 'lucide-react'
import Link from 'next/link'
import { useFormatter, useTranslations } from 'next-intl'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/patterns/empty-state'
import { SessionStatusBadge } from '@/modules/sessions/ui/session-status-badge'
import type { SessionShortcut } from '../domain/types'

export function SessionOverview({ sessions }: { sessions: readonly SessionShortcut[] }) {
  const t = useTranslations('navigation.sessionOverview')
  const format = useFormatter()

  if (sessions.length === 0) {
    return (
      <EmptyState
        title={t('emptyTitle')}
        description={t('emptyDescription')}
        icon={<CalendarX className="size-8" strokeWidth={1.25} />}
      />
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {sessions.map((session) => (
        <Link key={session.id} href={`/sessions/${session.id}`} className="group">
          <Card className="h-full transition-interactive group-hover:border-border-strong group-hover:bg-surface-hover">
            <CardHeader className="flex-row items-start justify-between gap-4">
              <div className="min-w-0">
                <CardTitle className="truncate">{session.title}</CardTitle>
                <p className="mt-1 truncate font-ui text-xs text-text-muted">
                  {session.campaignName}
                </p>
              </div>
              <SessionStatusBadge status={session.status} />
            </CardHeader>
            <CardContent>
              <p className="font-ui text-sm text-text-secondary">
                {sessionWhen(session, t, format)}
              </p>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  )
}

function sessionWhen(
  session: SessionShortcut,
  t: ReturnType<typeof useTranslations>,
  format: ReturnType<typeof useFormatter>,
): string {
  if (session.confirmedStartUtc) {
    return format.dateTime(new Date(session.confirmedStartUtc), {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Warsaw',
    })
  }
  if (session.availabilityDeadline) {
    return t('answersDue', {
      date: format.dateTime(new Date(session.availabilityDeadline), {
        day: 'numeric',
        month: 'long',
        timeZone: 'Europe/Warsaw',
      }),
    })
  }
  return t('dateNotSet')
}

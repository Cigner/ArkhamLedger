import { Badge } from '@/components/ui/badge'
import { useTranslations } from 'next-intl'
import type { UserStatus } from '../../domain/types'

/**
 * Account status.
 *
 * Each status gets its own word as well as its own colour, so the table is
 * readable without distinguishing hues.
 */
const STATUS_PRESENTATION: Record<UserStatus, 'positive' | 'warning' | 'muted'> = {
  ACTIVE: 'positive',
  PENDING_ACTIVATION: 'warning',
  DISABLED: 'muted',
}

export function UserStatusBadge({ status }: { status: UserStatus }) {
  const t = useTranslations('admin.userStatuses')
  return <Badge variant={STATUS_PRESENTATION[status]}>{t(status)}</Badge>
}

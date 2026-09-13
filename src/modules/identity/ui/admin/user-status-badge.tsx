import { Badge } from '@/components/ui/badge'
import type { UserStatus } from '../../domain/types'

/**
 * Account status.
 *
 * Each status gets its own word as well as its own colour, so the table is
 * readable without distinguishing hues.
 */
const STATUS_PRESENTATION: Record<
  UserStatus,
  { label: string; variant: 'positive' | 'warning' | 'muted' }
> = {
  ACTIVE: { label: 'Active', variant: 'positive' },
  PENDING_ACTIVATION: { label: 'Awaiting activation', variant: 'warning' },
  DISABLED: { label: 'Disabled', variant: 'muted' },
}

export function UserStatusBadge({ status }: { status: UserStatus }) {
  const presentation = STATUS_PRESENTATION[status]
  return <Badge variant={presentation.variant}>{presentation.label}</Badge>
}

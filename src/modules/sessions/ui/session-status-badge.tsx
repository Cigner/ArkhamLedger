import { Badge } from '@/components/ui/badge'
import type { SessionStatus } from '../domain/types'

/**
 * Session status.
 *
 * The label says what is happening rather than naming the enum: "Collecting
 * availability" tells a player what is expected of them, "COLLECTING" does not.
 */
const STATUS_PRESENTATION: Record<
  SessionStatus,
  { label: string; variant: 'neutral' | 'candle' | 'positive' | 'warning' | 'muted' | 'danger' }
> = {
  DRAFT: { label: 'Draft', variant: 'muted' },
  COLLECTING: { label: 'Collecting availability', variant: 'warning' },
  PROPOSED: { label: 'Awaiting a decision', variant: 'candle' },
  SCHEDULED: { label: 'Scheduled', variant: 'positive' },
  COMPLETED: { label: 'Played', variant: 'muted' },
  CANCELLED: { label: 'Cancelled', variant: 'danger' },
}

export function SessionStatusBadge({ status }: { status: SessionStatus }) {
  const presentation = STATUS_PRESENTATION[status]
  return <Badge variant={presentation.variant}>{presentation.label}</Badge>
}

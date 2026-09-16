import 'server-only'
import { headers } from 'next/headers'
import { auditLog } from '@/db/schema'
import { type DbOrTx, db } from '@/db/client'
import { newId } from '@/lib/ids'
import { securityLogger } from '@/lib/logger'

/**
 * Append-only audit trail.
 *
 * Records the security-relevant actions: account creation and status changes,
 * token issuance and consumption, ownership transfer, authorization denials.
 */
export type AuditEntry = {
  readonly actorId: string | null
  readonly action: string
  readonly entityType: string
  readonly entityId?: string | null
  readonly metadata?: Record<string, unknown>
}

export async function recordAudit(entry: AuditEntry, executor: DbOrTx = db): Promise<void> {
  try {
    const requestHeaders = await headers()
    const forwardedFor = requestHeaders.get('x-forwarded-for')
    const ipAddress = forwardedFor?.split(',')[0]?.trim() ?? null

    await executor.insert(auditLog).values({
      id: newId(),
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      metadata: entry.metadata ?? null,
      ipAddress,
      createdAt: new Date(),
    })
  } catch (error) {
    securityLogger.error({ err: error, action: entry.action }, 'failed to write audit entry')
  }
}

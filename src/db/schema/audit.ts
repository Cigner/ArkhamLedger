import { datetime, index, json, mysqlTable, varchar } from 'drizzle-orm/mysql-core'
import { idColumn } from './_shared'
import { authUser } from './auth'

/**
 * Append-only record of security-relevant actions.
 *
 * Written for administrative operations, ownership changes, token issuance and
 * consumption, and authorization denials. Deliberately not foreign-keyed to the
 * entities it references: the log must survive deletion of its subject.
 */
export const auditLog = mysqlTable(
  'audit_log',
  {
    id: idColumn().primaryKey(),
    actorId: idColumn('actor_id').references(() => authUser.id, { onDelete: 'set null' }),
    action: varchar('action', { length: 80 }).notNull(),
    entityType: varchar('entity_type', { length: 40 }).notNull(),
    entityId: varchar('entity_id', { length: 64 }),
    metadata: json('metadata'),
    ipAddress: varchar('ip_address', { length: 45 }),
    createdAt: datetime('created_at', { mode: 'date', fsp: 3 }).notNull(),
  },
  (t) => [
    index('ix_audit_entity').on(t.entityType, t.entityId, t.createdAt),
    index('ix_audit_actor').on(t.actorId, t.createdAt),
  ],
)

/**
 * Liveness marker written by the background worker.
 *
 * A worker that dies silently means no notifications and no deadline closures -
 * an outage invisible from the web tier. The health endpoint reads this row.
 */
export const workerHeartbeat = mysqlTable('worker_heartbeat', {
  id: varchar('id', { length: 32 }).primaryKey(),
  beatAt: datetime('beat_at', { mode: 'date', fsp: 3 }).notNull(),
})

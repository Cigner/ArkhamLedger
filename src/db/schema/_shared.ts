import { char, datetime } from 'drizzle-orm/mysql-core'

/**
 * Column fragments shared by every table.
 *
 * All identifiers are 26-character ULIDs and all timestamps are UTC with
 * millisecond precision. The database server itself runs with
 * `--default-time-zone=+00:00`, so no implicit conversion happens on write.
 */
export const ID_LENGTH = 26
export const TOKEN_HASH_LENGTH = 64

export const idColumn = (name = 'id') => char(name, { length: ID_LENGTH })

export const timestamps = {
  createdAt: datetime('created_at', { mode: 'date', fsp: 3 }).notNull(),
  updatedAt: datetime('updated_at', { mode: 'date', fsp: 3 }).notNull(),
}

export const softDelete = {
  deletedAt: datetime('deleted_at', { mode: 'date', fsp: 3 }),
}

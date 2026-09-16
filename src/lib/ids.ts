import { ulid } from 'ulid'

/**
 * Identifier generation and validation.
 *
 * ULIDs are used for every primary key: they sort by creation time, which keeps
 * the InnoDB clustered index append-only.
 */
const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/

export type Id = string

export function newId(): Id {
  return ulid()
}

export function isValidId(value: unknown): value is Id {
  return typeof value === 'string' && ULID_PATTERN.test(value)
}

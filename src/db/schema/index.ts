/**
 * Database schema barrel.
 *
 * Drizzle's relational query builder needs every table and relation in one
 * object, so all schema modules are re-exported here and this is the only
 * module the client should import.
 */
export * from './_shared'
export * from './auth'
export * from './campaign'
export * from './session'
export * from './availability'
export * from './scheduling'
export * from './notification'
export * from './audit'
export * from './feedback'
export * from './investigator'

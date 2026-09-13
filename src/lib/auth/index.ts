/**
 * Public surface of the authentication layer.
 *
 * Everything outside this directory imports from here; the lint configuration
 * blocks direct imports of the underlying library anywhere else.
 */
export { auth, type Auth } from './config'
export {
  authPort,
  type AuthPort,
  type AuthenticatedUser,
  type CreateUserInput,
  type GlobalRole,
  type UserStatus,
} from './port'
export { getOptionalUser, requireAdmin, requireUser } from './guards'
export { bootstrapAdmin } from './bootstrap'

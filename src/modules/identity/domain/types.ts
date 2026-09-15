import type { DeletionBlockers } from './deletion'

/**
 * Identity data transfer objects.
 *
 * These are the only shapes that leave the data layer. Database rows never do:
 * the account row carries a password digest, and the activation row carries a
 * token digest, neither of which has any business crossing into a component.
 */
export type GlobalRole = 'user' | 'admin'
export type UserStatus = 'PENDING_ACTIVATION' | 'ACTIVE' | 'DISABLED'

/** Shape shown in the administrator's user list. */
export type AdminUserListItem = {
  readonly id: string
  readonly email: string
  readonly name: string
  readonly role: GlobalRole
  readonly status: UserStatus
  readonly createdAt: Date
  readonly hasPendingActivation: boolean
  readonly activationExpiresAt: Date | null
  /** What they authored, and therefore what would block erasing the row. */
  readonly deletionBlockers: DeletionBlockers
}

/** The signed-in user's own profile. */
export type ProfileDto = {
  readonly id: string
  readonly email: string
  readonly name: string
  readonly role: GlobalRole
  readonly timezone: string
  readonly locale: string
}

/** Why an activation or reset token was rejected; drives the error screen. */
export type TokenRejection = 'INVALID' | 'EXPIRED' | 'ALREADY_USED'

export type TokenCheck =
  | { readonly ok: true; readonly userId: string; readonly email: string; readonly name: string }
  | { readonly ok: false; readonly reason: TokenRejection }

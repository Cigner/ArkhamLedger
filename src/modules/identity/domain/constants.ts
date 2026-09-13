/**
 * Identity policy constants.
 *
 * Collected here so that lifetimes and limits can be reviewed and tuned without
 * reading the logic that enforces them.
 */

/** How long an administrator-issued activation link stays usable. */
export const ACTIVATION_TOKEN_TTL_DAYS = 7

/**
 * Password reset links are far shorter-lived than activation links. An
 * activation link is handed over deliberately and out of band; a reset link
 * travels by email and is worth stealing.
 */
export const PASSWORD_RESET_TTL_MINUTES = 60

export const PASSWORD_MIN_LENGTH = 12
export const PASSWORD_MAX_LENGTH = 128

export const NAME_MIN_LENGTH = 2
export const NAME_MAX_LENGTH = 120

export const EMAIL_MAX_LENGTH = 254

/** Failed sign-in attempts, per email address, before the account is held. */
export const SIGN_IN_ATTEMPT_LIMIT = 10
export const SIGN_IN_LOCK_MINUTES = 15

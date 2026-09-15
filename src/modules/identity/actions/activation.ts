'use server'

import { db } from '@/db/client'
import { auth, authPort } from '@/lib/auth'
import { recordAudit } from '@/lib/audit'
import { DomainRuleError } from '@/lib/errors'
import { securityLogger } from '@/lib/logger'
import { publicActionClient } from '@/lib/safe-action'
import { activateAccountSchema } from '../domain/schemas'
import {
  claimActivationToken,
  markAccountActivated,
  setActivationPassword,
} from '../data/activation'
import { findUserRecord } from '../data/users'
import { canActivateAccount } from '../domain/rules'

/**
 * First sign-in: the account's owner sets their own password.
 *
 * The activation token is the entire authorization because the user has no
 * session yet.
 *
 * All persistent activation changes happen in one database transaction:
 *
 *   claim token
 *      -> hash password using Better Auth
 *      -> store credential
 *      -> mark account ACTIVE
 *      -> write audit
 *
 * If any step fails, the transaction rolls back. In particular, an invalid
 * password or an authentication-library failure can never leave an ACTIVE
 * account with a consumed activation token and no usable credential.
 */
export const activateAccount = publicActionClient
  .metadata({ name: 'auth.activateAccount' })
  .inputSchema(activateAccountSchema)
  .action(async ({ parsedInput }) => {
    const now = new Date()

    const claimed = await db.transaction(async (tx) => {
      const result = await claimActivationToken(parsedInput.token, now, tx)

      if (!result) {
        return null
      }

      const user = await findUserRecord(result.userId, tx)

      const allowed = canActivateAccount(user.status)

      if (!allowed.ok) {
        throw new DomainRuleError(allowed.error.key)
      }

      const passwordHash = await authPort.hashPassword(parsedInput.password)

      await setActivationPassword(user.id, passwordHash, now, tx)

      await markAccountActivated(user.id, now, tx)

      await recordAudit(
        {
          actorId: user.id,
          action: 'user.activated',
          entityType: 'user',
          entityId: user.id,
        },
        tx,
      )

      return user
    })

    if (!claimed) {
      securityLogger.warn('activation attempted with an unusable token')
      throw new DomainRuleError('identity.errors.tokenInvalid')
    }

    await auth.api.signInEmail({
      body: {
        email: claimed.email,
        password: parsedInput.password,
      },
      asResponse: false,
    })

    securityLogger.info({ userId: claimed.id }, 'account activated')

    return { ok: true }
  })

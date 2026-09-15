'use server'

import { db } from '@/db/client'
import { auth, authPort } from '@/lib/auth'
import { recordAudit } from '@/lib/audit'
import { DomainRuleError } from '@/lib/errors'
import { securityLogger } from '@/lib/logger'
import { publicActionClient } from '@/lib/safe-action'
import { activateAccountSchema } from '../domain/schemas'
import { claimActivationToken, markAccountActivated } from '../data/activation'
import { findUserRecord } from '../data/users'
import { canActivateAccount } from '../domain/rules'

/**
 * First sign-in: the account's owner sets their own password.
 *
 * Public by necessity - the user has no session yet - so the activation token is
 * the entire authorization. It is claimed inside the transaction with a
 * conditional update, which is what stops two concurrent submissions of the same
 * link from both succeeding.
 *
 * The password is set through the auth port afterwards rather than inside the
 * transaction, because the auth library owns its own connection. A crash between
 * the two leaves the token consumed and the account without a password, which an
 * administrator resolves by reissuing a link; the reverse ordering would leave a
 * usable link after the password was set, which is worse.
 */
export const activateAccount = publicActionClient
  .metadata({ name: 'auth.activateAccount' })
  .inputSchema(activateAccountSchema)
  .action(async ({ parsedInput }) => {
    const now = new Date()

    const claimed = await db.transaction(async (tx) => {
      const result = await claimActivationToken(parsedInput.token, now, tx)
      if (!result) return null

      const user = await findUserRecord(result.userId, tx)
      const allowed = canActivateAccount(user.status)
      if (!allowed.ok) throw new DomainRuleError(allowed.error.key)

      await markAccountActivated(user.id, now, tx)
      await recordAudit(
        { actorId: user.id, action: 'user.activated', entityType: 'user', entityId: user.id },
        tx,
      )

      return user
    })

    if (!claimed) {
      securityLogger.warn('activation attempted with an unusable token')
      throw new DomainRuleError('identity.errors.tokenInvalid')
    }

    await authPort.setPassword(claimed.id, parsedInput.password)

    // Sign the user in directly: asking someone to retype the password they set
    // one second ago adds a failure point and no security.
    await auth.api.signInEmail({
      body: { email: claimed.email, password: parsedInput.password },
      asResponse: false,
    })

    securityLogger.info({ userId: claimed.id }, 'account activated')

    return { ok: true }
  })

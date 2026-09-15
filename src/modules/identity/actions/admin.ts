'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { db } from '@/db/client'
import { authPort } from '@/lib/auth'
import { recordAudit } from '@/lib/audit'
import { env } from '@/lib/env'
import { ConflictError, DomainRuleError } from '@/lib/errors'
import { adminActionClient } from '@/lib/safe-action'
import {
  createUserSchema,
  deleteUserSchema,
  setUserStatusSchema,
  userIdSchema,
} from '../domain/schemas'
import { canDeleteUser, canHardDeleteUser } from '../domain/deletion'
import { canChangeOwnAccountState, canIssueActivationLink } from '../domain/rules'
import { issueActivationToken } from '../data/activation'
import {
  countDeletionBlockers,
  findUserByEmail,
  findUserRecord,
  hardDeleteUser,
  softDeleteUser,
  updateUserStatus,
} from '../data/users'

/**
 * Administrative account management.
 *
 * There is no public sign-up: an administrator creates the account and hands
 * over an activation link out of band. The link is returned to the caller and
 * shown once - it is never emailed by the application, because the out-of-band
 * channel the group already uses is more reliable than a home mail relay and
 * removes email from the trust path for the initial credential.
 */
const ACTIVATION_PATH = '/activate'

/** Placeholder credential so the account exists before its owner sets a password. */
function unusablePassword(): string {
  return randomBytes(48).toString('base64url')
}

function activationUrl(token: string): string {
  return `${env.BETTER_AUTH_URL}${ACTIVATION_PATH}/${token}`
}

export const createUser = adminActionClient
  .metadata({ name: 'admin.createUser' })
  .inputSchema(createUserSchema)
  .action(async ({ parsedInput, ctx }) => {
    const existing = await findUserByEmail(parsedInput.email)
    if (existing) throw new ConflictError('identity.errors.emailAlreadyRegistered')

    const created = await authPort.createUser({
      email: parsedInput.email,
      name: parsedInput.name,
      role: parsedInput.role,
      temporaryPassword: unusablePassword(),
    })

    const now = new Date()

    const { token, expiresAt } = await db.transaction(async (tx) => {
      await updateUserStatus(created.id, 'PENDING_ACTIVATION', tx)
      const issued = await issueActivationToken(created.id, ctx.user.id, now, tx)
      await recordAudit(
        {
          actorId: ctx.user.id,
          action: 'user.created',
          entityType: 'user',
          entityId: created.id,
          metadata: { email: parsedInput.email, role: parsedInput.role },
        },
        tx,
      )
      return issued
    })

    revalidatePath('/admin/users')

    // Shown once and not persisted in plaintext anywhere.
    return { userId: created.id, activationUrl: activationUrl(token), expiresAt }
  })

export const regenerateActivationLink = adminActionClient
  .metadata({ name: 'admin.regenerateActivationLink' })
  .inputSchema(userIdSchema)
  .action(async ({ parsedInput, ctx }) => {
    const user = await findUserRecord(parsedInput.userId)

    const allowed = canIssueActivationLink(user.status)
    if (!allowed.ok) throw new DomainRuleError(allowed.error.key)

    const now = new Date()

    const { token, expiresAt } = await db.transaction(async (tx) => {
      const issued = await issueActivationToken(user.id, ctx.user.id, now, tx)
      await recordAudit(
        {
          actorId: ctx.user.id,
          action: 'user.activationLinkReissued',
          entityType: 'user',
          entityId: user.id,
        },
        tx,
      )
      return issued
    })

    revalidatePath('/admin/users')

    return { activationUrl: activationUrl(token), expiresAt }
  })

export const setUserStatus = adminActionClient
  .metadata({ name: 'admin.setUserStatus' })
  .inputSchema(setUserStatusSchema)
  .action(async ({ parsedInput, ctx }) => {
    const allowed = canChangeOwnAccountState(ctx.user.id, parsedInput.userId)
    if (!allowed.ok) throw new DomainRuleError(allowed.error.key)

    const user = await findUserRecord(parsedInput.userId)

    await db.transaction(async (tx) => {
      await updateUserStatus(user.id, parsedInput.status, tx)
      await recordAudit(
        {
          actorId: ctx.user.id,
          action: parsedInput.status === 'DISABLED' ? 'user.disabled' : 'user.enabled',
          entityType: 'user',
          entityId: user.id,
        },
        tx,
      )
    })

    // Disabling must take effect now, not when the existing session expires.
    if (parsedInput.status === 'DISABLED') {
      await authPort.revokeAllSessions(user.id)
    }

    revalidatePath('/admin/users')

    return { ok: true }
  })

/**
 * Removes an account, in one of two ways.
 *
 * Closing it is always possible and keeps everything the person left behind:
 * who played which session, who said they were free. That is the group's record
 * as much as theirs.
 *
 * Erasing the row is offered only when nothing they authored would be destroyed
 * or orphaned with it, and the check is repeated here against fresh counts. The
 * checkbox that asked for it is a request from a browser; the database
 * constraints behind it would refuse anyway, but failing at the rule gives a
 * sentence somebody can act on instead of a driver error.
 */
export const deleteUser = adminActionClient
  .metadata({ name: 'admin.deleteUser' })
  .inputSchema(deleteUserSchema)
  .action(async ({ parsedInput, ctx }) => {
    const allowed = canDeleteUser({
      targetUserId: parsedInput.userId,
      actingUserId: ctx.user.id,
    })
    if (!allowed.ok) throw new DomainRuleError(allowed.error.key)

    const user = await findUserRecord(parsedInput.userId)
    const now = new Date()

    if (parsedInput.hard) {
      const blockers = await countDeletionBlockers(user.id)
      const erasable = canHardDeleteUser(blockers)
      if (!erasable.ok) {
        throw new DomainRuleError(erasable.error.key, erasable.error.params)
      }
    }

    await db.transaction(async (tx) => {
      if (parsedInput.hard) {
        /*
         * Written before the row disappears: the audit entry keeps the actor but
         * only a name and an address for the subject, because the subject is
         * about to stop existing and a dangling id is not a record of anything.
         */
        await recordAudit(
          {
            actorId: ctx.user.id,
            action: 'user.erased',
            entityType: 'user',
            entityId: user.id,
            metadata: { name: user.name, email: user.email },
          },
          tx,
        )

        await hardDeleteUser({ userId: user.id, executor: tx })
        return
      }

      await softDeleteUser({ userId: user.id, now, executor: tx })
      await recordAudit(
        {
          actorId: ctx.user.id,
          action: 'user.deleted',
          entityType: 'user',
          entityId: user.id,
        },
        tx,
      )
    })

    // Either way the person must stop being signed in immediately.
    await authPort.revokeAllSessions(user.id)

    revalidatePath('/admin/users')

    return { ok: true, erased: parsedInput.hard }
  })

'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { recordAudit } from '@/lib/audit'
import { auth } from '@/lib/auth'
import { authActionClient } from '@/lib/safe-action'
import { isValidTimeZone } from '@/lib/datetime/temporal'
import { DomainRuleError } from '@/lib/errors'
import { changePasswordSchema, updateProfileSchema } from '../domain/schemas'
import { updateOwnProfile } from '../data/users'

/**
 * Self-service profile and credential management.
 *
 * Both actions operate on the session's own user id. Neither accepts a user id
 * from the client: doing so would turn a profile form into a way to edit anyone.
 */
export const updateProfile = authActionClient
  .metadata({ name: 'profile.update' })
  .inputSchema(updateProfileSchema)
  .action(async ({ parsedInput, ctx }) => {
    if (!isValidTimeZone(parsedInput.timezone)) {
      throw new DomainRuleError('identity.errors.invalidTimezone')
    }

    await updateOwnProfile(ctx.user.id, parsedInput)
    revalidatePath('/settings/profile')

    return { ok: true }
  })

export const changePassword = authActionClient
  .metadata({ name: 'profile.changePassword' })
  .inputSchema(changePasswordSchema)
  .action(async ({ parsedInput, ctx }) => {
    // revokeOtherSessions ends every other session but keeps this one, so the
    // user is not signed out of the tab they just used.
    await auth.api.changePassword({
      body: {
        currentPassword: parsedInput.currentPassword,
        newPassword: parsedInput.password,
        revokeOtherSessions: true,
      },
      headers: await headers(),
    })

    await recordAudit({
      actorId: ctx.user.id,
      action: 'user.passwordChanged',
      entityType: 'user',
      entityId: ctx.user.id,
    })

    return { ok: true }
  })

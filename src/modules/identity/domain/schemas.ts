import { z } from 'zod'
import {
  EMAIL_MAX_LENGTH,
  NAME_MAX_LENGTH,
  NAME_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from './constants'
import { isWeakPassword } from './weak-passwords'

/**
 * Input schemas for identity operations.
 *
 * Shared between the browser, where they drive form validation, and the server,
 * where they are the actual trust boundary. The client-side use is convenience;
 * the server-side use is the security control, and neither is optional.
 */
export const emailSchema = z.string().trim().toLowerCase().max(EMAIL_MAX_LENGTH).pipe(z.email())

export const displayNameSchema = z
  .string()
  .trim()
  .min(NAME_MIN_LENGTH)
  .max(NAME_MAX_LENGTH)
  // Control characters render unpredictably and can be used to spoof names.
  .refine((value) => !/[\p{Cc}\p{Cf}]/u.test(value), {
    error: 'identity.errors.nameControlCharacters',
  })

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, { error: 'identity.errors.passwordTooShort' })
  .max(PASSWORD_MAX_LENGTH, { error: 'identity.errors.passwordTooLong' })
  .refine((value) => !isWeakPassword(value), { error: 'identity.errors.passwordTooCommon' })

/** Opaque token from an activation, invitation or reset link. */
export const tokenSchema = z
  .string()
  .min(32)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/, { error: 'identity.errors.tokenMalformed' })

export const globalRoleSchema = z.enum(['user', 'admin'])

export const createUserSchema = z.object({
  email: emailSchema,
  name: displayNameSchema,
  role: globalRoleSchema.default('user'),
})

export const userIdSchema = z.object({
  userId: z.string().length(26),
})

export const setUserStatusSchema = z.object({
  userId: z.string().length(26),
  status: z.enum(['ACTIVE', 'DISABLED']),
})

export const deleteUserSchema = z.object({
  userId: z.string().length(26),
  /**
   * Whether to erase the row rather than close the account. Offered by the
   * interface only when nothing blocks it, and checked again on the server —
   * the form is a suggestion, not an authorisation.
   */
  hard: z.boolean().default(false),
})

export const activateAccountSchema = z
  .object({
    token: tokenSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    error: 'identity.errors.passwordsDoNotMatch',
    path: ['confirmPassword'],
  })

export const requestPasswordResetSchema = z.object({
  email: emailSchema,
})

export const resetPasswordSchema = z
  .object({
    token: tokenSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    error: 'identity.errors.passwordsDoNotMatch',
    path: ['confirmPassword'],
  })

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    error: 'identity.errors.passwordsDoNotMatch',
    path: ['confirmPassword'],
  })
  .refine((value) => value.currentPassword !== value.password, {
    error: 'identity.errors.passwordUnchanged',
    path: ['password'],
  })

export const updateProfileSchema = z.object({
  name: displayNameSchema,
  timezone: z.string().min(1).max(64),
  locale: z.enum(['en']),
})

export type CreateUserInput = z.infer<typeof createUserSchema>
export type ActivateAccountInput = z.infer<typeof activateAccountSchema>
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>

/**
 * Turns an action result into one sentence for the user.
 *
 * Server Actions return two kinds of failure with different shapes: a
 * `serverError` carrying an i18n key from an AppError, and `validationErrors` in
 * a nested per-field structure. Both end up in the same place on screen, so the
 * flattening lives here rather than in every form.
 */
type NestedErrors = { _errors?: string[] } & Record<string, unknown>

export function firstValidationKey(errors: unknown): string | undefined {
  if (!errors || typeof errors !== 'object') return undefined

  const node = errors as NestedErrors

  if (Array.isArray(node._errors) && node._errors.length > 0) return node._errors[0]

  for (const [key, value] of Object.entries(node)) {
    if (key === '_errors') continue
    const nested = firstValidationKey(value)
    if (nested) return nested
  }

  return undefined
}

/**
 * Resolves a message key against a lookup, falling back to a generic sentence.
 *
 * The fallback matters: an unmapped key must never surface to the user as a
 * dotted identifier.
 */
export function resolveActionError(
  messages: Record<string, string>,
  fallback: string,
  serverErrorKey?: string,
  validationErrors?: unknown,
): string {
  const validationKey = firstValidationKey(validationErrors)

  return (
    (serverErrorKey ? messages[serverErrorKey] : undefined) ??
    (validationKey ? messages[validationKey] : undefined) ??
    fallback
  )
}

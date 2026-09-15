/**
 * Typed reads from a FormData.
 *
 * `FormData.get` returns `string | File | null`, and stringifying the File case
 * silently yields "[object File]" - which then fails validation with a message
 * that points nowhere near the cause. Reading through these helpers makes the
 * non-string cases explicit instead.
 */
export function readString(form: FormData, key: string): string {
  const value = form.get(key)
  return typeof value === 'string' ? value : ''
}

export function readOptionalString(form: FormData, key: string): string | undefined {
  const value = form.get(key)
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export function readString(form: FormData, key: string): string {
  const value = form.get(key)
  return typeof value === 'string' ? value : ''
}

export function readOptionalString(form: FormData, key: string): string | undefined {
  const value = form.get(key)
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/**
 * Result type for domain rules.
 *
 * Domain rules return failures instead of throwing so that callers can evaluate
 * several rules and present every problem at once, rather than stopping at the
 * first one. Exceptions remain reserved for genuinely exceptional conditions.
 */
export type DomainError = {
  readonly key: string
  readonly params?: Readonly<Record<string, string | number>>
}

export type Result<T, E = DomainError> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E }

export function ok(): Result<void>
export function ok<T>(value: T): Result<T>
export function ok<T>(value?: T): Result<T | undefined> {
  return { ok: true, value }
}

export function err<E = DomainError>(error: E): Result<never, E> {
  return { ok: false, error }
}

export function fail(key: string, params?: Record<string, string | number>): Result<never> {
  return { ok: false, error: params ? { key, params } : { key } }
}

/** Collects every failure from a set of independent rule checks. */
export function collectErrors(results: readonly Result<unknown>[]): DomainError[] {
  return results.flatMap((result) => (result.ok ? [] : [result.error]))
}

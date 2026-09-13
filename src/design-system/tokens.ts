import { readFileSync } from 'node:fs'
import { contrastRatio, round } from './contrast'

/**
 * Token reader for tooling and tests.
 *
 * Parses the custom properties out of tokens.css and resolves `var()` chains, so
 * that contrast checks measure the values the browser will actually paint rather
 * than a hand-maintained copy of them.
 *
 * Node-only: it reads from disk and is never bundled into the client.
 */
const TOKENS_PATH = 'src/design-system/tokens.css'
const DECLARATION = /--([a-z0-9-]+):\s*([^;]+);/gi
const VAR_REFERENCE = /^var\(--([a-z0-9-]+)\)$/i
const MAX_RESOLUTION_DEPTH = 10

export type TokenMap = ReadonlyMap<string, string>

export function readTokens(path: string = TOKENS_PATH): TokenMap {
  const css = readFileSync(path, 'utf8')
  const tokens = new Map<string, string>()

  for (const match of css.matchAll(DECLARATION)) {
    if (match[1] && match[2]) tokens.set(match[1], match[2].trim())
  }

  return tokens
}

/** Follows `var()` indirection to the literal colour a token ends at. */
export function resolveToken(tokens: TokenMap, name: string, depth = 0): string {
  const raw = tokens.get(name)
  if (raw === undefined) throw new Error(`Unknown design token: --${name}`)

  const reference = VAR_REFERENCE.exec(raw)
  if (reference?.[1] && depth < MAX_RESOLUTION_DEPTH) {
    return resolveToken(tokens, reference[1], depth + 1)
  }

  return raw
}

/**
 * Contrast between two tokens.
 *
 * Translucent tokens are composited over the page background before measuring,
 * which is the only meaningful way to score an alpha border or heatmap step.
 */
export function tokenContrast(
  tokens: TokenMap,
  foreground: string,
  background: string,
  backdrop = 'color-surface-canvas',
): number {
  return round(
    contrastRatio(
      resolveToken(tokens, foreground),
      resolveToken(tokens, background),
      resolveToken(tokens, backdrop),
    ),
  )
}

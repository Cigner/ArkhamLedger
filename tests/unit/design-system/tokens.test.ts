import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { readTokens, resolveToken } from '@/design-system/tokens'

/**
 * Structural guarantees about the token file itself.
 *
 * These are not aesthetic checks — each one guards a failure mode that produced
 * a visible bug during development and would otherwise return silently.
 */
const TOKENS_CSS = readFileSync('src/design-system/tokens.css', 'utf8')

describe('token emission', () => {
  /*
   * Tailwind prunes theme variables it cannot see referenced in source. Tokens
   * selected at runtime — a heatmap step chosen from a participant count — are
   * invisible to that scanner, so the whole block must be marked static or those
   * cells paint as nothing.
   */
  it('declares the theme block as static so dynamic tokens survive pruning', () => {
    expect(TOKENS_CSS).toMatch(/@theme\s+static\s*\{/)
  })
})

describe('token integrity', () => {
  const tokens = readTokens()

  it('resolves every var() reference to a literal value', () => {
    for (const [name] of tokens) {
      expect(() => resolveToken(tokens, name)).not.toThrow()
    }
  })

  it('defines every token the availability grid selects at runtime', () => {
    const runtimeTokens = [
      'color-slot-yes',
      'color-slot-if-need-be',
      'color-slot-no',
      'color-slot-empty',
      'color-avail-1',
      'color-avail-2',
      'color-avail-3',
      'color-avail-4',
      'color-avail-5',
      'color-avail-best-ring',
    ]

    for (const token of runtimeTokens) {
      expect(tokens.has(token)).toBe(true)
    }
  })

  it('keeps the two solid-fill foregrounds separate', () => {
    expect(tokens.has('color-text-on-accent')).toBe(true)
    expect(tokens.has('color-text-on-candle')).toBe(true)
    expect(tokens.has('color-text-on-solid')).toBe(false)
  })

  it('defines both halves of the focus ring', () => {
    expect(tokens.has('color-focus-ring')).toBe(true)
    expect(tokens.has('color-focus-ring-contrast')).toBe(true)
  })
})

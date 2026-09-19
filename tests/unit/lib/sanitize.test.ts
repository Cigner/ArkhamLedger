import { describe, expect, it } from 'vitest'
import { sanitizeOptionalText, sanitizeUserText } from '@/lib/text/sanitize'

/**
 * Text cleaning.
 *
 * The cases that matter are the ones that survive HTML escaping: a string that
 * renders as something other than what it contains is still a problem in a
 * document several people read.
 */
describe('sanitizeUserText', () => {
  it('leaves ordinary text alone', () => {
    expect(sanitizeUserText('Harriet Vane')).toBe('Harriet Vane')
  })

  it('strips the characters that reorder a sentence on screen', () => {
    const spoofed = `Harriet\u202E enaV\u202C`

    expect(sanitizeUserText(spoofed)).toBe('Harriet enaV')
  })

  it('strips zero-width characters used to hide text', () => {
    expect(sanitizeUserText(`Har\u200Briet`)).toBe('Harriet')
  })

  it('strips control codes that corrupt exports', () => {
    expect(sanitizeUserText(`Harriet\u0000\u001FVane`)).toBe('HarrietVane')
  })

  it('keeps accented characters in one normalized form', () => {
    const decomposed = `Go\u0301rnik`

    expect(sanitizeUserText(decomposed)).toBe('Górnik')
    expect(sanitizeUserText(decomposed).length).toBe(6)
  })

  it('folds a name onto one line by default', () => {
    expect(sanitizeUserText('Harriet\nVane')).toBe('Harriet Vane')
  })

  it('keeps paragraphs where they are allowed, without the gaps', () => {
    expect(sanitizeUserText('One\n\n\n\nTwo', { allowLineBreaks: true })).toBe('One\n\nTwo')
  })

  it('normalizes line endings from any platform', () => {
    expect(sanitizeUserText('One\r\nTwo', { allowLineBreaks: true })).toBe('One\nTwo')
  })

  it('collapses runs of spaces and trims the edges', () => {
    expect(sanitizeUserText('  Harriet   Vane  ')).toBe('Harriet Vane')
  })

  /*
   * Cut rather than refused. A description pasted from a word processor should
   * not fail a form because it ran twenty characters long.
   */
  it('cuts to the maximum length', () => {
    expect(sanitizeUserText('Harriet Vane', { maxLength: 7 })).toBe('Harriet')
  })

  it('counts the limit after cleaning, not before', () => {
    expect(sanitizeUserText(`Harriet\u200B\u200B\u200B`, { maxLength: 7 })).toBe('Harriet')
  })
})

describe('sanitizeOptionalText', () => {
  it('passes null and undefined through', () => {
    expect(sanitizeOptionalText(null)).toBeNull()
    expect(sanitizeOptionalText(undefined)).toBeNull()
  })

  it('turns text that cleans down to nothing into null', () => {
    expect(sanitizeOptionalText(`   \u200B  `)).toBeNull()
  })

  it('keeps text that survives', () => {
    expect(sanitizeOptionalText('  Oxford ')).toBe('Oxford')
  })
})

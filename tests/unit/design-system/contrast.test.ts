import { describe, expect, it } from 'vitest'
import { readTokens, resolveToken, tokenContrast } from '@/design-system/tokens'
import {
  composite,
  contrastRatio,
  parseColor,
  relativeLuminance,
  round,
} from '@/design-system/contrast'

/**
 * Contrast budget for the palette.
 *
 * This suite is the accessibility audit: it reads the real token values from
 * tokens.css and fails the build when a colour change drops a pair below its
 * threshold. Thresholds come from WCAG 2.2 with a deliberate margin on body
 * text, because light-on-dark needs more headroom than the 4.5:1 floor to read
 * as crisply as the same ratio does in light mode.
 */
const tokens = readTokens()

const BODY_TEXT_MIN = 7
const SECONDARY_TEXT_MIN = 4.5
const NON_TEXT_MIN = 3

/** Every surface a component can sit on, worst case included. */
const SURFACES = [
  'color-surface-canvas',
  'color-surface-subtle',
  'color-surface-raised',
  'color-surface-overlay',
  'color-surface-hover',
  'color-surface-active',
] as const

describe('text contrast', () => {
  it.each(SURFACES)('primary text clears %s at 7:1', (surface) => {
    expect(tokenContrast(tokens, 'color-text-primary', surface)).toBeGreaterThanOrEqual(
      BODY_TEXT_MIN,
    )
  })

  it.each(SURFACES)('secondary text clears %s at 4.5:1', (surface) => {
    expect(tokenContrast(tokens, 'color-text-secondary', surface)).toBeGreaterThanOrEqual(
      SECONDARY_TEXT_MIN,
    )
  })

  it.each(SURFACES)('muted text clears %s at 4.5:1', (surface) => {
    expect(tokenContrast(tokens, 'color-text-muted', surface)).toBeGreaterThanOrEqual(
      SECONDARY_TEXT_MIN,
    )
  })

  it('accent text clears the canvas at 4.5:1', () => {
    expect(tokenContrast(tokens, 'color-accent-text', 'color-surface-canvas')).toBeGreaterThanOrEqual(
      SECONDARY_TEXT_MIN,
    )
  })
})

describe('foregrounds on solid fills', () => {
  /*
   * The two accents need opposite foregrounds. Asserting both directions stops
   * anyone "simplifying" them back into one shared token, which is the mistake
   * that produced a 2.2:1 primary button in the first draft of this palette.
   */
  it('light foreground on the oxblood accent clears 4.5:1', () => {
    expect(tokenContrast(tokens, 'color-text-on-accent', 'color-accent-solid')).toBeGreaterThanOrEqual(
      SECONDARY_TEXT_MIN,
    )
  })

  it('dark foreground on the brass accent clears 4.5:1', () => {
    expect(tokenContrast(tokens, 'color-text-on-candle', 'color-candle-9')).toBeGreaterThanOrEqual(
      SECONDARY_TEXT_MIN,
    )
  })

  it('the two solid foregrounds are not interchangeable', () => {
    expect(tokenContrast(tokens, 'color-text-on-candle', 'color-accent-solid')).toBeLessThan(
      SECONDARY_TEXT_MIN,
    )
    expect(tokenContrast(tokens, 'color-text-on-accent', 'color-candle-9')).toBeLessThan(
      SECONDARY_TEXT_MIN,
    )
  })
})

describe('non-text contrast (WCAG 1.4.11)', () => {
  const INTERACTIVE_BORDERS = ['color-border-default', 'color-border-strong'] as const

  it.each(
    INTERACTIVE_BORDERS.flatMap((border) =>
      (['color-surface-canvas', 'color-surface-overlay'] as const).map(
        (surface) => [border, surface] as const,
      ),
    ),
  )('%s clears %s at 3:1', (border, surface) => {
    expect(tokenContrast(tokens, border, surface, surface)).toBeGreaterThanOrEqual(NON_TEXT_MIN)
  })

  it('the ornament border clears the canvas at 3:1', () => {
    expect(
      tokenContrast(tokens, 'color-border-ornament', 'color-surface-canvas'),
    ).toBeGreaterThanOrEqual(NON_TEXT_MIN)
  })

  /*
   * border-subtle is deliberately exempt. It draws decorative rules between
   * blocks of content and never defines a control's boundary or state, which is
   * what 1.4.11 actually covers.
   */
  it('the subtle border is decorative and stays below the interactive threshold', () => {
    expect(tokenContrast(tokens, 'color-border-subtle', 'color-surface-canvas')).toBeLessThan(
      NON_TEXT_MIN,
    )
  })

  /*
   * The guarantee under test is about the PAIR of ring tones, not either one:
   * for every background the ring can appear over — including the densest
   * heatmap cell — at least one tone must clear 3:1. No single colour satisfies
   * this, which is why the ring is rendered as an outline plus a halo.
   */
  it('keeps at least one focus ring tone above 3:1 on every background', () => {
    const canvas = resolveToken(tokens, 'color-surface-canvas')
    const densestCell = composite(
      parseColor(resolveToken(tokens, 'color-avail-5')),
      parseColor(canvas),
    )
    const backgrounds = [
      ...SURFACES.map((surface) => resolveToken(tokens, surface)),
      `rgb(${Math.round(densestCell.r)} ${Math.round(densestCell.g)} ${Math.round(densestCell.b)})`,
    ]

    const inner = resolveToken(tokens, 'color-focus-ring')
    const outer = resolveToken(tokens, 'color-focus-ring-contrast')

    for (const background of backgrounds) {
      const best = Math.max(
        contrastRatio(inner, background),
        contrastRatio(outer, background),
      )
      expect(round(best)).toBeGreaterThanOrEqual(NON_TEXT_MIN)
    }
  })

  it('needs both ring tones: neither alone covers every background', () => {
    const canvas = resolveToken(tokens, 'color-surface-canvas')
    const densest = composite(parseColor(resolveToken(tokens, 'color-avail-5')), parseColor(canvas))
    const densestCell = `rgb(${Math.round(densest.r)} ${Math.round(densest.g)} ${Math.round(densest.b)})`

    // Bright tone fails on the densest cell; dark tone fails on the canvas.
    expect(contrastRatio(resolveToken(tokens, 'color-focus-ring'), densestCell)).toBeLessThan(
      NON_TEXT_MIN,
    )
    expect(
      contrastRatio(resolveToken(tokens, 'color-focus-ring-contrast'), canvas),
    ).toBeLessThan(NON_TEXT_MIN)
  })
})

describe('availability slot states', () => {
  const STATES = ['color-slot-yes', 'color-slot-if-need-be', 'color-slot-no'] as const

  it.each(STATES)('%s clears the canvas at 3:1', (state) => {
    expect(tokenContrast(tokens, state, 'color-surface-canvas')).toBeGreaterThanOrEqual(
      NON_TEXT_MIN,
    )
  })

  /*
   * Documents a real constraint rather than a wish: the three states are close
   * in luminance, so a colour-blind or low-vision user cannot separate them by
   * fill alone. The grid must render a glyph per state, and this assertion
   * exists so nobody later removes the glyphs believing colour is sufficient.
   */
  it('cannot be told apart by colour alone', () => {
    const pairs: [string, string][] = [
      ['color-slot-yes', 'color-slot-if-need-be'],
      ['color-slot-yes', 'color-slot-no'],
      ['color-slot-if-need-be', 'color-slot-no'],
    ]

    for (const [a, b] of pairs) {
      expect(tokenContrast(tokens, a, b)).toBeLessThan(NON_TEXT_MIN)
    }
  })
})

describe('availability heatmap ramp', () => {
  const RAMP = [
    'color-avail-1',
    'color-avail-2',
    'color-avail-3',
    'color-avail-4',
    'color-avail-5',
  ] as const

  const canvas = resolveToken(tokens, 'color-surface-canvas')

  /** A ramp step as it is actually painted: alpha flattened onto the canvas. */
  function flattenedStep(token: string): string {
    const flat = composite(parseColor(resolveToken(tokens, token)), parseColor(canvas))
    return `rgb(${Math.round(flat.r)} ${Math.round(flat.g)} ${Math.round(flat.b)})`
  }

  it('rises monotonically', () => {
    const ratios = RAMP.map((step) => round(contrastRatio(flattenedStep(step), canvas)))
    expect([...ratios].sort((a, b) => a - b)).toEqual(ratios)
  })

  it('reaches 3:1 against the canvas at the densest step', () => {
    const densest = RAMP.at(-1)
    expect(round(contrastRatio(flattenedStep(densest!), canvas))).toBeGreaterThanOrEqual(
      NON_TEXT_MIN,
    )
  })

  it('separates adjacent steps perceptibly', () => {
    for (let i = 0; i < RAMP.length - 1; i += 1) {
      const ratio = contrastRatio(flattenedStep(RAMP[i]!), flattenedStep(RAMP[i + 1]!))
      expect(ratio).toBeGreaterThanOrEqual(1.2)
    }
  })

  it('marks the best slot with a ring that reads on the densest cells', () => {
    const ring = resolveToken(tokens, 'color-avail-best-ring')

    for (const step of ['color-avail-4', 'color-avail-5'] as const) {
      expect(round(contrastRatio(ring, flattenedStep(step)))).toBeGreaterThanOrEqual(NON_TEXT_MIN)
    }
  })
})

describe('modal scrim', () => {
  /*
   * The scrim must darken the page, not lighten it. Asserting the direction
   * catches the easy mistake of reaching for one of the light alpha neutrals,
   * which washes the background out instead of receding it.
   */
  it('is darker than the lightest surface it covers', () => {
    const scrim = composite(
      parseColor(resolveToken(tokens, 'color-scrim')),
      parseColor(resolveToken(tokens, 'color-surface-active')),
    )
    const surface = parseColor(resolveToken(tokens, 'color-surface-active'))

    expect(relativeLuminance(scrim)).toBeLessThan(relativeLuminance(surface))
  })
})

describe('surface elevation', () => {
  it('separates each step from the one below it', () => {
    const steps = [...SURFACES]

    for (let i = 0; i < steps.length - 1; i += 1) {
      expect(tokenContrast(tokens, steps[i + 1]!, steps[i]!)).toBeGreaterThan(1.05)
    }
  })
})

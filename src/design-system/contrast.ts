/**
 * Contrast measurement for the design tokens.
 *
 * Exists so that the palette's accessibility is a test rather than a claim: the
 * token values are parsed from the stylesheet and checked against the project's
 * contrast budget on every test run. A colour tweak that breaks a threshold
 * fails CI instead of shipping.
 *
 * Implements WCAG 2.x relative luminance and contrast ratio. Alpha colours are
 * composited over an explicit backdrop first, because a translucent border has
 * no contrast of its own — only against what lies beneath it.
 */
export type Rgb = { readonly r: number; readonly g: number; readonly b: number }
export type Rgba = Rgb & { readonly a: number }

const HEX_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i
const RGB_PATTERN =
  /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[/,]\s*([\d.]+%?)\s*)?\)$/i

export function parseColor(value: string): Rgba {
  const input = value.trim()

  const hex = HEX_PATTERN.exec(input)
  if (hex?.[1]) {
    const digits =
      hex[1].length === 3
        ? hex[1]
            .split('')
            .map((c) => c + c)
            .join('')
        : hex[1]
    return {
      r: parseInt(digits.slice(0, 2), 16),
      g: parseInt(digits.slice(2, 4), 16),
      b: parseInt(digits.slice(4, 6), 16),
      a: 1,
    }
  }

  const rgb = RGB_PATTERN.exec(input)
  if (rgb) {
    const alphaToken = rgb[4]
    const alpha = alphaToken
      ? alphaToken.endsWith('%')
        ? Number(alphaToken.slice(0, -1)) / 100
        : Number(alphaToken)
      : 1
    return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]), a: alpha }
  }

  throw new Error(`Unsupported colour format: ${value}`)
}

/** Flattens a translucent colour onto an opaque backdrop. */
export function composite(foreground: Rgba, backdrop: Rgb): Rgb {
  const a = foreground.a
  return {
    r: foreground.r * a + backdrop.r * (1 - a),
    g: foreground.g * a + backdrop.g * (1 - a),
    b: foreground.b * a + backdrop.b * (1 - a),
  }
}

function channelLuminance(value: number): number {
  const c = value / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

export function relativeLuminance(color: Rgb): number {
  return (
    0.2126 * channelLuminance(color.r) +
    0.7152 * channelLuminance(color.g) +
    0.0722 * channelLuminance(color.b)
  )
}

/**
 * WCAG contrast ratio between two colours, each composited over `backdrop`
 * when translucent. Returns a value between 1 and 21.
 */
export function contrastRatio(foreground: string, background: string, backdrop?: string): number {
  const backdropRgb = backdrop ? composite(parseColor(backdrop), { r: 0, g: 0, b: 0 }) : undefined
  const bg = flatten(background, backdropRgb ?? { r: 0, g: 0, b: 0 })
  const fg = flatten(foreground, bg)

  const lighter = Math.max(relativeLuminance(fg), relativeLuminance(bg))
  const darker = Math.min(relativeLuminance(fg), relativeLuminance(bg))

  return (lighter + 0.05) / (darker + 0.05)
}

function flatten(value: string, backdrop: Rgb): Rgb {
  const parsed = parseColor(value)
  return parsed.a === 1 ? parsed : composite(parsed, backdrop)
}

export function round(ratio: number): number {
  return Math.round(ratio * 100) / 100
}

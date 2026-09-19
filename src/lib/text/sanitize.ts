/**
 * Server-side cleaning of text people type.
 *
 * React escapes markup on the way out, so this is not about script injection. It
 * is about the characters that survive escaping and still change what a reader
 * sees: bidirectional overrides that can reorder a sentence, zero-width
 * characters that hide content inside an innocent-looking string, and control
 * codes that corrupt exports and terminal output.
 *
 * Applied where text is stored rather than where it is rendered, so that every
 * later reader - the sheet, an export, a PDF, an email - gets the same string.
 */

/*
 * Unicode's explicit ordering controls. Legitimate right-to-left text does not
 * need them: the bidirectional algorithm handles Arabic and Hebrew on its own,
 * and these exist to override it. In a shared document they are a way to make
 * one sentence display as another.
 */
const BIDI_CONTROLS = /[\u202A-\u202E\u2066-\u2069]/g

/** Zero-width and invisible formatting characters, which hide text in plain sight. */
const INVISIBLES = /[\u200B-\u200F\u2060-\u2064\uFEFF]/g

/** C0 and C1 control codes, except the tab and newline that text legitimately uses. */
const CONTROL_CODES = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g

export type SanitizeOptions = {
  /** Characters kept, counted after cleaning. Longer input is cut, not refused. */
  readonly maxLength?: number
  /** Whether line breaks survive. Off for a name, on for a description. */
  readonly allowLineBreaks?: boolean
}

/**
 * Cleans one piece of user-authored text.
 *
 * Deliberately lossy and silent: the alternative is refusing a paste from a word
 * processor because it carried a zero-width space, which teaches people that the
 * form is broken rather than that their text was.
 */
export function sanitizeUserText(input: string, options: SanitizeOptions = {}): string {
  const allowLineBreaks = options.allowLineBreaks ?? false

  let text = input
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(BIDI_CONTROLS, '')
    .replace(INVISIBLES, '')
    .replace(CONTROL_CODES, '')

  text = allowLineBreaks
    ? // Three or more blank lines is somebody formatting with the return key.
      text.replace(/\n{3,}/g, '\n\n')
    : text.replace(/\n/g, ' ')

  text = text
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trimEnd())
    .join('\n')
    .trim()

  const maxLength = options.maxLength
  return maxLength !== undefined && text.length > maxLength ? text.slice(0, maxLength).trim() : text
}

/**
 * The same, for a value that may legitimately be absent.
 *
 * Text that cleans down to nothing becomes null rather than an empty string: a
 * column holding '' and a column holding NULL mean the same thing to a reader
 * and different things to a query.
 */
export function sanitizeOptionalText(
  input: string | null | undefined,
  options: SanitizeOptions = {},
): string | null {
  if (input === null || input === undefined) return null
  const text = sanitizeUserText(input, options)
  return text.length > 0 ? text : null
}

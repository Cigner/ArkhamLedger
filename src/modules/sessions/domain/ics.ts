/**
 * A session as a calendar event.
 *
 * The point of this file is that a confirmed date ends up in everybody's phone
 * without anybody typing it in. Getting it slightly wrong is worse than not
 * sending it: a calendar that refuses to import shows nothing and says nothing
 * about why.
 *
 * Three parts of RFC 5545 are easy to skip and break real clients:
 *   - lines end with CRLF, and are folded at 75 octets with a leading space;
 *   - commas, semicolons and backslashes inside text are escaped, and newlines
 *     become a literal `\n`;
 *   - UID is stable across updates, so a moved session replaces the old entry
 *     instead of appearing twice.
 */
export type CalendarEvent = {
  /** Stable for the life of the session; a reschedule reuses it. */
  readonly uid: string
  readonly title: string
  readonly description: string | null
  readonly startUtc: Date
  readonly endUtc: Date
  readonly cancelled: boolean
  /**
   * Rises with every change so clients accept the newer copy. Seconds since the
   * epoch of the last update: monotonic without needing a counter in the schema.
   */
  readonly updatedAt: Date
  readonly organizerName: string
  readonly url: string | null
}

const PRODID = '-//Arkham Ledger//Session Scheduling//EN'
const LINE_LIMIT = 75

export function buildCalendar(event: CalendarEvent): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    `METHOD:${event.cancelled ? 'CANCEL' : 'PUBLISH'}`,
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${stamp(event.updatedAt)}`,
    `DTSTART:${stamp(event.startUtc)}`,
    `DTEND:${stamp(event.endUtc)}`,
    `SEQUENCE:${Math.floor(event.updatedAt.getTime() / 1000)}`,
    `STATUS:${event.cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
    `SUMMARY:${escapeText(event.title)}`,
    ...(event.description ? [`DESCRIPTION:${escapeText(event.description)}`] : []),
    ...(event.url ? [`URL:${escapeText(event.url)}`] : []),
    `ORGANIZER;CN=${escapeText(event.organizerName)}:MAILTO:noreply@invalid`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]

  return `${lines.flatMap(fold).join('\r\n')}\r\n`
}

/** `YYYYMMDDTHHMMSSZ`, the only form every client agrees on. */
function stamp(value: Date): string {
  return `${value.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`
}

/**
 * Escapes the four characters that would otherwise end the property early.
 *
 * Backslash first: escaping it after the others would double the escapes they
 * introduced, and a title with a comma in it would arrive with a stray slash.
 */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/**
 * Folds a long line, counting octets rather than characters.
 *
 * A campaign name with an accent in it is more bytes than it looks, and a fold
 * placed by character count can land inside a multi-byte sequence and corrupt
 * it.
 */
function fold(line: string): string[] {
  const bytes = Buffer.from(line, 'utf8')
  if (bytes.length <= LINE_LIMIT) return [line]

  const parts: string[] = []
  let offset = 0
  let limit = LINE_LIMIT

  while (offset < bytes.length) {
    let end = Math.min(offset + limit, bytes.length)

    // Never split a multi-byte character: back off to the start of one.
    while (end > offset && end < bytes.length && (bytes[end]! & 0b1100_0000) === 0b1000_0000) {
      end -= 1
    }

    const chunk = bytes.subarray(offset, end).toString('utf8')
    parts.push(offset === 0 ? chunk : ` ${chunk}`)
    offset = end
    // Continuation lines carry a leading space, which counts towards the limit.
    limit = LINE_LIMIT - 1
  }

  return parts
}

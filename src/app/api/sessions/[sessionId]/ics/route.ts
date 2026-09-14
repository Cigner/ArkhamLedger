import { NextResponse } from 'next/server'
import { env } from '@/lib/env'
import { isAppError } from '@/lib/errors'
import { getSessionDetail } from '@/modules/sessions/data/sessions'
import { buildCalendar } from '@/modules/sessions/domain/ics'

/**
 * Calendar export for a confirmed session.
 *
 * A Route Handler rather than a Server Action because the response is a file,
 * not data. Safe as a GET: it reads, it is authorized by the same data-layer
 * guard as the session page, and it carries no side effect that a prefetch could
 * trigger.
 *
 * Only a member gets it, and only once a date exists — an .ics with no time in
 * it is a file that fails to import for reasons the reader cannot see.
 */
export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
): Promise<NextResponse> {
  const { sessionId } = await params

  try {
    const session = await getSessionDetail(sessionId)

    if (!session.confirmedStartUtc || !session.confirmedEndUtc) {
      return NextResponse.json({ error: 'no date confirmed' }, { status: 409 })
    }

    const calendar = buildCalendar({
      uid: `session-${session.id}@arkham-ledger`,
      title: session.title,
      description: session.description,
      startUtc: session.confirmedStartUtc,
      endUtc: session.confirmedEndUtc,
      cancelled: session.status === 'CANCELLED',
      // Any change to the session moves this, which is what tells a calendar
      // client that the copy it already has is the older one.
      updatedAt: session.confirmedStartUtc,
      organizerName: session.campaignName,
      url: `${env.BETTER_AUTH_URL}/sessions/${session.id}`,
    })

    return new NextResponse(calendar, {
      status: 200,
      headers: {
        'content-type': 'text/calendar; charset=utf-8',
        'content-disposition': `attachment; filename="${filename(session.title)}"`,
        'cache-control': 'no-store',
      },
    })
  } catch (error) {
    if (isAppError(error)) {
      return NextResponse.json({ error: error.code }, { status: error.httpStatus })
    }
    throw error
  }
}

/**
 * A filename a file manager will accept.
 *
 * Everything outside a conservative set is dropped rather than escaped: a title
 * with a quote or a slash in it is a header injection waiting to happen, and
 * nobody minds what the file is called.
 */
function filename(title: string): string {
  const safe = title.replace(/[^a-zA-Z0-9 _-]/g, '').trim().slice(0, 60)
  return `${safe || 'session'}.ics`
}

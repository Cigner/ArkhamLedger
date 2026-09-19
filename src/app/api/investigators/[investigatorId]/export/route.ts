import { NextResponse } from 'next/server'
import { isAppError } from '@/lib/errors'
import { getInvestigatorView } from '@/modules/investigators/data/investigator-view'
import { SHEET_SCHEMA_VERSION } from '@/modules/investigators/domain/sheet'

/**
 * A character as a file.
 *
 * Exports exactly what the reader may see - the same projection the sheet
 * renders, with the same fields withheld. A player who cannot read somebody's
 * Sanity must not be able to download it, and an export that quietly bypassed
 * the projection would be the most convenient hole in the whole feature.
 *
 * Notes and history are not in it. The file is the character, not the record of
 * who has been told what about them.
 */
export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ investigatorId: string }> },
): Promise<NextResponse> {
  const { investigatorId } = await params

  try {
    const view = await getInvestigatorView(investigatorId)

    const payload = {
      format: 'arkham-ledger/investigator',
      schemaVersion: SHEET_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      ruleset: { id: view.sheet.rulesetId, version: view.sheet.rulesetVersion },
      sheet: view.sheet,
    }

    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="${filename(view.sheet.identity.name)}"`,
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
 * Everything outside a conservative set is dropped rather than escaped: a
 * character called `../../etc` is a header waiting to be misread, and nobody
 * minds what the file is called.
 */
function filename(name: string | null): string {
  const safe = (name ?? '')
    .replace(/[^a-zA-Z0-9 _-]/g, '')
    .trim()
    .slice(0, 60)
  return `${safe || 'investigator'}.json`
}

import { describe, expect, it } from 'vitest'
import {
  submitIssueReportSchema,
  updateIssueReportStatusSchema,
} from '@/modules/feedback/domain/schemas'

describe('issue report input', () => {
  it('normalizes a valid report from an internal page', () => {
    expect(
      submitIssueReportSchema.parse({
        message: '  The save button did not respond.  ',
        sourcePath: '/sessions/01H00000000000000000000001?tab=dates',
      }),
    ).toEqual({
      message: 'The save button did not respond.',
      sourcePath: '/sessions/01H00000000000000000000001',
    })
  })

  it('does not persist tokens carried by a route', () => {
    const result = submitIssueReportSchema.parse({
      message: 'The invitation screen did not explain what happened.',
      sourcePath: '/invite/secret-one-time-token',
    })

    expect(result.sourcePath).toBe('/campaigns')
  })

  it.each(['https://attacker.test', '//attacker.test/path', 'sessions/123'])(
    'rejects a non-local source path: %s',
    (sourcePath) => {
      const result = submitIssueReportSchema.safeParse({
        message: 'A sufficiently detailed report.',
        sourcePath,
      })

      expect(result.success).toBe(false)
    },
  )

  it('accepts only known workflow statuses', () => {
    const base = { reportId: '01H00000000000000000000001' }

    expect(updateIssueReportStatusSchema.safeParse({ ...base, status: 'PLANNED' }).success).toBe(
      true,
    )
    expect(updateIssueReportStatusSchema.safeParse({ ...base, status: 'CLOSED' }).success).toBe(
      false,
    )
  })
})

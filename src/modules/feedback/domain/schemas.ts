import { z } from 'zod'

export const ISSUE_MESSAGE_MAX_LENGTH = 4_000
export const ISSUE_MESSAGE_MIN_LENGTH = 10

export const issueReportStatusSchema = z.enum([
  'NEW',
  'DONE',
  'PLANNED',
  'REJECTED',
  'NEEDS_MORE_INFO',
])

export const submitIssueReportSchema = z.object({
  message: z
    .string()
    .trim()
    .min(ISSUE_MESSAGE_MIN_LENGTH, 'feedback.errors.messageTooShort')
    .max(ISSUE_MESSAGE_MAX_LENGTH, 'feedback.errors.messageTooLong'),
  sourcePath: z
    .string()
    .trim()
    .max(500)
    .regex(/^\/(?!\/)[^\u0000-\u001f\u007f]*$/, 'feedback.errors.invalidPath')
    .transform(safeSourcePath),
})

function safeSourcePath(value: string): string {
  const path = value.split(/[?#]/, 1)[0] ?? '/'
  if (/^\/(?:activate|invite|reset-password)\/[^/]+/.test(path)) {
    return path.startsWith('/invite/') ? '/campaigns' : '/'
  }
  return path
}

export const updateIssueReportStatusSchema = z.object({
  reportId: z.string().length(26),
  status: issueReportStatusSchema,
})

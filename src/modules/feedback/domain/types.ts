export type IssueReportStatus = 'NEW' | 'DONE' | 'PLANNED' | 'REJECTED' | 'NEEDS_MORE_INFO'

export type IssueReportListItem = {
  readonly id: string
  readonly message: string
  readonly sourcePath: string
  readonly status: IssueReportStatus
  readonly reporterName: string
  readonly reporterEmail: string | null
  readonly statusEditorName: string | null
  readonly statusChangedAt: Date | null
  readonly createdAt: Date
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAction } from 'next-safe-action/hooks'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { updateIssueReportStatus } from '../actions/reports'
import type { IssueReportStatus } from '../domain/types'

export function IssueReportStatusForm({
  reportId,
  status: initialStatus,
}: {
  reportId: string
  status: IssueReportStatus
}) {
  const router = useRouter()
  const t = useTranslations('feedback.statusForm')
  const statusT = useTranslations('feedback.statuses')
  const [status, setStatus] = useState<IssueReportStatus>(initialStatus)
  const [failed, setFailed] = useState(false)

  const action = useAction(updateIssueReportStatus, {
    onSuccess: () => {
      setFailed(false)
      router.refresh()
    },
    onError: () => setFailed(true),
  })

  return (
    <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
      <Select
        items={{
          NEW: statusT('NEW'),
          DONE: statusT('DONE'),
          PLANNED: statusT('PLANNED'),
          REJECTED: statusT('REJECTED'),
          NEEDS_MORE_INFO: statusT('NEEDS_MORE_INFO'),
        }}
        value={status}
        onValueChange={(value) => setStatus(String(value) as IssueReportStatus)}
      >
        <SelectTrigger className="w-full sm:w-56" aria-label={t('label')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(['NEW', 'DONE', 'PLANNED', 'REJECTED', 'NEEDS_MORE_INFO'] as const).map((value) => (
            <SelectItem key={value} value={value}>
              {statusT(value)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        disabled={action.isPending || status === initialStatus}
        onClick={() => action.execute({ reportId, status })}
      >
        {action.isPending ? t('saving') : t('save')}
      </Button>
      {failed ? (
        <span role="alert" className="font-ui text-xs text-status-danger">
          {t('error')}
        </span>
      ) : null}
    </div>
  )
}

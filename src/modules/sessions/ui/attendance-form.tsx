'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAction } from 'next-safe-action/hooks'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FormError } from '@/modules/identity/ui/form-error'
import { completeSession } from '../actions/session'
import type { Attendance, SessionDetail } from '../domain/types'

/**
 * Records who was actually there, and closes the session.
 *
 * Attendance is captured at the moment of closing rather than offered as a
 * separate chore afterwards, because the separate chore never happens and the
 * record is what later makes "who has missed the last three" answerable.
 */
const ATTENDANCE_LABELS = {
  ATTENDED: 'Was there',
  ABSENT: 'Missed it',
  UNKNOWN: 'Not recorded',
} as const

export function AttendanceForm({ session }: { session: SessionDetail }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [attendance, setAttendance] = useState<Map<string, Attendance>>(
    () =>
      new Map(
        session.participants.map((participant) => [
          participant.userId,
          participant.attendance === 'UNKNOWN' ? 'ATTENDED' : participant.attendance,
        ]),
      ),
  )

  const complete = useAction(completeSession, {
    onSuccess: () => router.refresh(),
    onError: () => setError('Could not close this session. Reload and try again.'),
  })

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        setError(null)
        complete.execute({
          sessionId: session.id,
          attendance: [...attendance.entries()].map(([userId, value]) => ({
            userId,
            attendance: value,
          })),
        })
      }}
      className="flex flex-col gap-4"
    >
      <ul className="flex flex-col gap-3">
        {session.participants.map((participant) => (
          <li key={participant.userId} className="flex items-center justify-between gap-4">
            <span className="font-ui text-sm text-text-primary">{participant.name}</span>
            <div className="w-40">
              <Select
                items={ATTENDANCE_LABELS}
                value={attendance.get(participant.userId) ?? 'ATTENDED'}
                onValueChange={(value) =>
                  setAttendance((current) =>
                    new Map(current).set(participant.userId, value as Attendance),
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ATTENDANCE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </li>
        ))}
      </ul>

      <FormError>{error}</FormError>

      <div>
        <Button type="submit" variant="accent" disabled={complete.isPending}>
          {complete.isPending ? 'Closing…' : 'Record attendance and close'}
        </Button>
      </div>
    </form>
  )
}

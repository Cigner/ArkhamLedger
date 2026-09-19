'use client'

import { Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAction } from 'next-safe-action/hooks'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { resolveActionError } from '@/modules/identity/ui/action-errors'
import { FormError } from '@/modules/identity/ui/form-error'
import { setSessionParticipants } from '../actions/participants'
import { defaultQuorum } from '../domain/constants'
import type { ParticipantPriority, SessionDetail } from '../domain/types'

/**
 * Who is invited, and how much their presence matters.
 *
 * Priorities are the Keeper's private working notes. They are never shown to the
 * people they describe - being told you are "optional" is a social injury the
 * feature does not need to inflict to do its job.
 *
 * Keepers are pinned to required and their control is disabled: a session
 * without the person running it is not a session, and the rule is enforced
 * server-side regardless.
 */
export function ParticipantsForm({
  session,
  candidates,
}: {
  session: SessionDetail
  candidates: readonly { userId: string; name: string; isKeeper: boolean }[]
}) {
  const t = useTranslations('sessions.participants')
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const priorityLabels = {
    REQUIRED: t('priorities.REQUIRED.label'),
    PREFERRED: t('priorities.PREFERRED.label'),
    OPTIONAL: t('priorities.OPTIONAL.label'),
  } as const
  const priorityHelp: Record<ParticipantPriority, string> = {
    REQUIRED: t('priorities.REQUIRED.help'),
    PREFERRED: t('priorities.PREFERRED.help'),
    OPTIONAL: t('priorities.OPTIONAL.help'),
  }
  const messages: Record<string, string> = {
    'sessions.errors.participantsLocked': t('errors.participantsLocked'),
    'sessions.errors.noKeeperAmongParticipants': t('errors.noKeeper'),
    'sessions.errors.quorumAboveParticipantCount': t('errors.quorumTooHigh'),
    'sessions.errors.noParticipants': t('errors.noParticipants'),
  }

  const initial = new Map(
    session.participants.map((participant) => [participant.userId, participant.priority]),
  )

  const [selected, setSelected] = useState<Map<string, ParticipantPriority>>(() => new Map(initial))
  /*
   * Who is bringing a character. Held separately from the priority because the
   * two are independent: a Keeper may play, and somebody may sit in without a
   * sheet. Only people who differ from the default are tracked.
   */
  const [playing, setPlaying] = useState<Map<string, boolean>>(
    () =>
      new Map(
        session.participants.map((participant) => [
          participant.userId,
          participant.playsInvestigator,
        ]),
      ),
  )
  const [quorum, setQuorum] = useState(String(session.quorum))

  const save = useAction(setSessionParticipants, {
    onSuccess: () => {
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
      router.refresh()
    },
    onError: ({ error: actionError }) => {
      setError(
        resolveActionError(
          messages,
          t('errors.saveFailed'),
          actionError.serverError?.messageKey,
          actionError.validationErrors,
        ),
      )
    },
  })

  function toggle(userId: string, isKeeper: boolean) {
    setSelected((current) => {
      const next = new Map(current)
      if (next.has(userId)) next.delete(userId)
      else next.set(userId, isKeeper ? 'REQUIRED' : 'PREFERRED')
      return next
    })
  }

  function setPriority(userId: string, priority: ParticipantPriority) {
    setSelected((current) => new Map(current).set(userId, priority))
  }

  const playsByDefault = (userId: string): boolean =>
    !candidates.find((candidate) => candidate.userId === userId)?.isKeeper

  const plays = (userId: string): boolean => playing.get(userId) ?? playsByDefault(userId)

  const investigatorCount = [...selected.keys()].filter(
    (userId) => !candidates.find((candidate) => candidate.userId === userId)?.isKeeper,
  ).length

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        setError(null)
        save.execute({
          sessionId: session.id,
          quorum: Number(quorum),
          participants: [...selected.entries()].map(([userId, priority]) => ({
            userId,
            priority,
            playsInvestigator: plays(userId),
          })),
        })
      }}
      className="flex flex-col gap-6"
      noValidate
    >
      <TableContainer>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">{t('invited')}</TableHead>
              <TableHead>{t('name')}</TableHead>
              <TableHead>{t('priority')}</TableHead>
              <TableHead>{t('playsCharacter')}</TableHead>
              <TableHead>{t('answered')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {candidates.map((candidate) => {
              const invited = selected.has(candidate.userId)
              const priority = selected.get(candidate.userId) ?? 'PREFERRED'
              const participant = session.participants.find(
                (entry) => entry.userId === candidate.userId,
              )

              return (
                <TableRow key={candidate.userId}>
                  <TableCell>
                    <Checkbox
                      checked={invited}
                      onCheckedChange={() => toggle(candidate.userId, candidate.isKeeper)}
                      aria-label={t('invitePerson', { name: candidate.name })}
                    />
                  </TableCell>
                  <TableCell>
                    {candidate.name}
                    {candidate.isKeeper ? (
                      <span className="ml-2 font-ui text-2xs uppercase tracking-[--tracking-smallcaps] text-candle-11">
                        {t('keeper')}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {invited ? (
                      <div className="flex max-w-56 flex-col gap-1">
                        <Select
                          items={priorityLabels}
                          value={candidate.isKeeper ? 'REQUIRED' : priority}
                          disabled={candidate.isKeeper}
                          onValueChange={(value) =>
                            setPriority(candidate.userId, value as ParticipantPriority)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(priorityLabels).map(([value, label]) => (
                              <SelectItem key={value} value={value}>
                                {label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <span className="font-ui text-2xs text-text-muted">
                          {candidate.isKeeper ? t('keeperRequired') : priorityHelp[priority]}
                        </span>
                      </div>
                    ) : (
                      <span className="font-ui text-sm text-text-muted">{t('notInvited')}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {invited ? (
                      <Checkbox
                        aria-label={t('playsCharacter')}
                        checked={plays(candidate.userId)}
                        onCheckedChange={(checked) =>
                          setPlaying((current) =>
                            new Map(current).set(candidate.userId, Boolean(checked)),
                          )
                        }
                      />
                    ) : (
                      <span className="font-ui text-sm text-text-muted">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-text-secondary">
                    {participant?.respondedAt ? t('yes') : '—'}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </TableContainer>

      <Field className="max-w-56">
        <FieldLabel htmlFor="quorum">{t('quorum')}</FieldLabel>
        <Input
          id="quorum"
          type="number"
          min={1}
          max={selected.size || 1}
          value={quorum}
          onChange={(event) => setQuorum(event.target.value)}
          required
        />
        <FieldDescription>
          {t('quorumHint', { count: defaultQuorum(investigatorCount) })}
        </FieldDescription>
      </Field>

      <FormError>{error}</FormError>

      <div className="flex items-center gap-3">
        <Button type="submit" variant="accent" disabled={save.isPending}>
          <Check className="size-4" aria-hidden="true" />
          {save.isPending ? t('saving') : t('saveRoster')}
        </Button>
        {saved ? (
          <span role="status" className="font-ui text-xs text-status-positive">
            {t('saved')}
          </span>
        ) : null}
      </div>
    </form>
  )
}

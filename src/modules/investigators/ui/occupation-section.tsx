'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAction } from 'next-safe-action/hooks'
import { useTranslations } from 'next-intl'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { resolveActionError } from '@/modules/identity/ui/action-errors'
import { saveOccupation } from '../actions/skills'
import type { SheetOptions } from '../data/sheet-options'
import type { ProjectedSheet } from '../domain/sheet'
import { SheetSection } from './sheet-section'

/**
 * The job, and the eight skills it comes with.
 *
 * An occupation is two things at once: a budget of skill points and the list of
 * skills that budget may be spent on. Both are shown before it is chosen,
 * because choosing blind and then discovering the budget is how somebody ends up
 * starting over.
 *
 * Half the catalog ends in "and two others of your choice", so the open slots
 * are rendered as pickers in the order the rules present them.
 */
export function OccupationSection({
  sheet,
  options,
  readOnly,
  onVersionChange,
}: {
  sheet: ProjectedSheet
  options: SheetOptions
  readOnly: boolean
  onVersionChange: (version: number) => void
}) {
  const t = useTranslations('investigators.sheet.occupation')
  const errors = useTranslations('investigators.sheet.errors')
  const names = useTranslations('investigators')
  const router = useRouter()

  const [occupationId, setOccupationId] = useState(sheet.identity.occupationId ?? '')
  const [characteristic, setCharacteristic] = useState(
    sheet.identity.occupationCharacteristic ?? '',
  )
  const [contact, setContact] = useState(sheet.identity.occupationContact ?? '')
  const [choices, setChoices] = useState<Record<number, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const selected = useMemo(
    () => options.occupations.find((entry) => entry.id === occupationId) ?? null,
    [options.occupations, occupationId],
  )

  const skillName = (skillKey: string): string => {
    const option = options.skills.find((entry) => entry.skillKey === skillKey)
    if (option) return names(option.nameKey.replace('investigators.', ''))

    const [definitionId, specialization] = skillKey.split(':')
    const family = options.skills.find((entry) => entry.familyId === definitionId)
    const familyName = family ? names(family.nameKey.replace('investigators.', '')) : definitionId
    return specialization ? `${familyName} (${specialization})` : (familyName ?? skillKey)
  }

  const openSlots = (selected?.slots ?? []).flatMap((slot, index) =>
    slot.kind === 'CHOICE' ? [{ slot, index }] : [],
  )

  const save = useAction(saveOccupation, {
    onSuccess: ({ data }) => {
      setSaved(true)
      if (data?.version !== undefined) onVersionChange(data.version)
      router.refresh()
    },
    onError: ({ error: actionError }) => {
      setSaved(false)
      setError(
        resolveActionError(
          {
            'investigators.errors.sheetMovedOn': errors('sheetMovedOn'),
            'investigators.errors.characteristicsRequiredFirst': t('errors.characteristicsFirst'),
            'investigators.errors.wrongOccupationChoiceCount': t('errors.chooseAll'),
            'investigators.errors.duplicateOccupationSkill': t('errors.duplicateChoice'),
            'investigators.errors.skillNotOnOffer': t('errors.notOnOffer'),
            'investigators.errors.occupationCharacteristicRequired': t('errors.pickCharacteristic'),
          },
          errors('saveFailed'),
          actionError.serverError?.messageKey,
          actionError.validationErrors,
        ),
      )
    },
  })

  const occupationLabels = Object.fromEntries(
    options.occupations.map((entry) => [
      entry.id,
      names(entry.nameKey.replace('investigators.', '')),
    ]),
  )

  const flatChoices = openSlots.flatMap(({ slot, index }) =>
    Array.from({ length: slot.count }, (_unused, position) => choices[index * 10 + position] ?? ''),
  )

  return (
    <SheetSection
      title={t('title')}
      description={t('description')}
      readOnly={readOnly}
      pending={save.isPending}
      saved={saved}
      error={error}
      onSave={() => {
        setError(null)
        save.execute({
          investigatorId: sheet.id,
          expectedVersion: sheet.lockVersion,
          occupationId,
          characteristic: characteristic === '' ? null : (characteristic as 'EDU'),
          choices: flatChoices.filter((value) => value !== ''),
          contact: contact.trim() === '' ? null : contact.trim(),
        })
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="occupation">{t('occupation')}</FieldLabel>
          <Select
            value={occupationId}
            onValueChange={(value) => {
              setOccupationId(String(value))
              setChoices({})
              setSaved(false)
            }}
          >
            <SelectTrigger id="occupation" disabled={readOnly}>
              <SelectValue placeholder={t('choose')}>
                {(value: string) => occupationLabels[value] ?? ''}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {options.occupations.map((entry) => (
                <SelectItem key={entry.id} value={entry.id}>
                  {occupationLabels[entry.id]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {selected && selected.allowedCharacteristics.length > 0 ? (
          <Field>
            <FieldLabel htmlFor="occupation-characteristic">{t('characteristic')}</FieldLabel>
            <Select
              value={characteristic}
              onValueChange={(value) => {
                setCharacteristic(String(value))
                setSaved(false)
              }}
            >
              <SelectTrigger id="occupation-characteristic" disabled={readOnly}>
                <SelectValue placeholder={t('choose')}>{(value: string) => value}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {selected.allowedCharacteristics.map((key) => (
                  <SelectItem key={key} value={key}>
                    {key}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>{t('characteristicHint')}</FieldDescription>
          </Field>
        ) : null}

        <Field className="sm:col-span-2">
          <FieldLabel htmlFor="occupation-contact">{t('contact')}</FieldLabel>
          <Input
            id="occupation-contact"
            value={contact}
            maxLength={300}
            disabled={readOnly}
            onChange={(event) => {
              setContact(event.target.value)
              setSaved(false)
            }}
          />
          <FieldDescription>{t('contactHint')}</FieldDescription>
        </Field>
      </div>

      {selected ? (
        <div className="flex flex-col gap-4 rounded-sm bg-surface-raised p-4">
          <p className="font-ui text-sm text-text-secondary">
            {t('creditRating', {
              minimum: selected.creditRating.minimum,
              maximum: selected.creditRating.maximum,
            })}
          </p>

          <ul className="flex flex-wrap gap-2">
            {selected.slots
              .flatMap((slot) => (slot.kind === 'FIXED' ? [slot.skillKey] : []))
              .map((skillKey) => (
                <li
                  key={skillKey}
                  className="rounded-sm border border-border-subtle px-2 py-1 font-ui text-xs text-text-primary"
                >
                  {skillName(skillKey)}
                </li>
              ))}
          </ul>

          {openSlots.map(({ slot, index }) =>
            Array.from({ length: slot.count }, (_unused, position) => {
              const key = index * 10 + position
              const available =
                slot.options.length > 0
                  ? slot.options
                  : options.skills
                      .filter((entry) => !entry.skillKey.endsWith(':CHOOSE'))
                      .map((entry) => entry.skillKey)

              return (
                <Field key={key}>
                  <FieldLabel htmlFor={`slot-${key}`}>
                    {t(`slots.${slot.label}`, { count: slot.count })}
                  </FieldLabel>
                  <Select
                    value={choices[key] ?? ''}
                    onValueChange={(value) => {
                      setChoices((current) => ({ ...current, [key]: String(value) }))
                      setSaved(false)
                    }}
                  >
                    <SelectTrigger id={`slot-${key}`} disabled={readOnly}>
                      <SelectValue placeholder={t('choose')}>
                        {(value: string) => (value ? skillName(value) : '')}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {available.map((skillKey) => (
                        <SelectItem key={skillKey} value={skillKey}>
                          {skillName(skillKey)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )
            }),
          )}
        </div>
      ) : null}

      {options.budgets.occupationPoints !== null ? (
        <p className="font-ui text-sm text-text-secondary">
          {t('budget', {
            occupation: options.budgets.occupationPoints,
            personal: options.budgets.personalInterestPoints ?? 0,
          })}
        </p>
      ) : null}
    </SheetSection>
  )
}

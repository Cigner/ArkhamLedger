'use client'

import { useTranslations } from 'next-intl'
import { cellPresentation } from './grid-cell'
import type { SlotState } from '../domain/types'

const ENTRIES: readonly (SlotState | null)[] = ['YES', 'IF_NEED_BE', 'NO', null]

export function AvailabilityLegend() {
  const t = useTranslations('availability.stateLabels')
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {ENTRIES.map((state) => {
        const presentation = cellPresentation(state)
        return (
          <li key={state ?? 'blank'} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={`flex size-5 items-center justify-center rounded-sm border border-border-subtle text-xs ${presentation.className}`}
            >
              {presentation.glyph}
            </span>
            <span className="font-ui text-xs text-text-secondary">{t(presentation.labelKey)}</span>
          </li>
        )
      })}
    </ul>
  )
}

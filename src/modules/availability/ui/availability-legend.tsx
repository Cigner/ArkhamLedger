import { cellPresentation } from './grid-cell'
import type { SlotState } from '../domain/types'

/**
 * What the marks mean.
 *
 * Required rather than helpful: the three fills are within about 1.1:1 of each
 * other, so the glyph is what actually distinguishes them and the legend is
 * where that mapping is stated.
 */
const ENTRIES: readonly (SlotState | null)[] = ['YES', 'IF_NEED_BE', 'NO', null]

export function AvailabilityLegend() {
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
            <span className="font-ui text-xs text-text-secondary">{presentation.label}</span>
          </li>
        )
      })}
    </ul>
  )
}

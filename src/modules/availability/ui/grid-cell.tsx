import { cn } from '@/lib/cn'
import type { SlotState } from '../domain/types'

/**
 * One hour of one day.
 *
 * Every state carries a glyph as well as a fill. That is not decoration: the
 * three state colours sit within about 1.1:1 of each other, which the palette's
 * own contrast tests assert, so colour alone cannot distinguish them for anyone
 * with reduced colour vision - or on a dim screen in a dark room, which is where
 * this application will mostly be read.
 */
const PRESENTATION: Record<
  SlotState | 'blank',
  { className: string; glyph: string; label: string }
> = {
  YES: { className: 'bg-slot-yes text-text-on-candle', glyph: '●', label: 'free' },
  IF_NEED_BE: {
    className: 'bg-slot-if-need-be text-text-on-candle',
    glyph: '◐',
    label: 'free at a push',
  },
  NO: { className: 'bg-slot-no text-text-on-candle', glyph: '✕', label: 'not free' },
  blank: { className: 'bg-slot-empty text-text-muted', glyph: '', label: 'no answer' },
}

export function cellPresentation(state: SlotState | null) {
  return PRESENTATION[state ?? 'blank']
}

export function GridCell({
  state,
  selected,
  focused,
  tooShort,
  label,
  onPointerDown,
  onPointerEnter,
  onKeyDown,
  onFocus,
  cellRef,
}: {
  state: SlotState | null
  selected: boolean
  focused: boolean
  tooShort: boolean
  label: string
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void
  onPointerEnter: () => void
  onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void
  onFocus: () => void
  cellRef: (element: HTMLDivElement | null) => void
}) {
  const presentation = cellPresentation(state)

  return (
    <div
      ref={cellRef}
      role="gridcell"
      aria-selected={selected}
      aria-label={label}
      // A single tab stop for the whole grid: focus moves with the arrow keys.
      tabIndex={focused ? 0 : -1}
      data-state={state ?? 'blank'}
      onPointerDown={onPointerDown}
      onPointerEnter={onPointerEnter}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      className={cn(
        'flex h-full w-full select-none items-center justify-center rounded-sm border border-border-subtle',
        'font-ui text-xs leading-none',
        // No transition on the fill: painting that fades reads as lag.
        'cursor-pointer',
        presentation.className,
        tooShort && state !== null && state !== 'NO' && 'ring-1 ring-inset ring-status-warning',
      )}
    >
      <span aria-hidden="true">{presentation.glyph}</span>
    </div>
  )
}

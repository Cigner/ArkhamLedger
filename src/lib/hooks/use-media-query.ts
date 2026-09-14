'use client'

import { useCallback, useSyncExternalStore } from 'react'

/**
 * Subscribes to a media query.
 *
 * Uses useSyncExternalStore because a media query is exactly that: state owned
 * by the browser rather than by React. Mirroring it into useState through an
 * effect works until concurrent rendering tears the two apart, and it also
 * renders once with the wrong answer before correcting.
 *
 * The server snapshot is false, so the wide layout is rendered first and
 * narrowed after hydration — the safe direction, since a grid that is too wide
 * scrolls whereas one that is too narrow is unusable.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const media = window.matchMedia(query)
      media.addEventListener('change', onChange)
      return () => media.removeEventListener('change', onChange)
    },
    [query],
  )

  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query])
  const getServerSnapshot = useCallback(() => false, [])

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

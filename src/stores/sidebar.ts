'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type SidebarStore = {
  readonly expanded: boolean
  readonly setExpanded: (expanded: boolean) => void
  readonly toggle: () => void
}

export const useSidebarStore = create<SidebarStore>()(
  persist(
    (set) => ({
      expanded: true,
      setExpanded: (expanded) => set({ expanded }),
      toggle: () => set((state) => ({ expanded: !state.expanded })),
    }),
    {
      name: 'arkham-sidebar',
      partialize: (state) => ({ expanded: state.expanded }),
      skipHydration: true,
    },
  ),
)

import { useMemo } from 'react'
import { useShellState } from './useShellState'
import { EMPTY_TOPBAR_LAYOUT, resolveTopbarLayout } from '../components/topbar/layout/topbarLayout'

export function useTopbarLayout(): TopbarLayoutItem[] {
  const stored = useShellState<StoredTopbarLayout>(
    window.topbar?.initialLayout ?? EMPTY_TOPBAR_LAYOUT,
    () => window.topbar.layout(),
    (callback) => window.topbar.onLayoutChanged(callback)
  )

  return useMemo(() => resolveTopbarLayout(stored), [stored])
}

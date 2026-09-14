import { useCallback, useMemo, useState } from 'react'
import { moveTopbarItem, stepTopbarItemPast } from '../components/topbar/layout/topbarLayoutEdits'
import {
  effectiveRidgeItems,
  hideRidgeItemPlan,
  isDefaultRidge,
  resetRidgePlan,
  restoreLayoutVisibility,
  showRidgeItemPlan,
} from '../components/settings/ridge/ridgeVisibility'
import { useRidgeGates } from './useRidgeGates'
import { REFUSED_WRITE_MESSAGE, useTopbarLayoutEditor } from './useTopbarLayoutEditor'

function sameStoredLayout(first: TopbarLayoutItem[], second: TopbarLayoutItem[]): boolean {
  return (
    first.length === second.length &&
    first.every(
      (item, at) => item.id === second[at].id && item.slot === second[at].slot && item.visible === second[at].visible
    )
  )
}

async function runInOrder(
  steps: RidgeVisibilityStep[],
  runStep: (step: RidgeVisibilityStep) => Promise<boolean>
): Promise<boolean> {
  for (const step of steps) {
    if (!(await runStep(step))) return false
  }
  return true
}

export function useRidgeEditor(): RidgeEditor {
  const { items: layout, error: layoutError, commit: commitLayout, reset: resetLayout } = useTopbarLayoutEditor()
  const { visible: gates, setGate } = useRidgeGates()
  const [gateError, setGateError] = useState<string | null>(null)

  const items = useMemo(() => effectiveRidgeItems(layout, gates), [layout, gates])

  const writeGate = useCallback(
    async (item: TopbarGatedItemId, shown: boolean) => {
      const written = await setGate(item, shown)
      if (!written) setGateError(REFUSED_WRITE_MESSAGE)
      return written
    },
    [setGate]
  )

  const runStep = useCallback(
    (step: RidgeVisibilityStep): Promise<boolean> => {
      if (step.kind === 'layout') return commitLayout(step.items)
      if (step.kind === 'layout-reset') return resetLayout()
      return writeGate(step.item, step.visible)
    },
    [commitLayout, resetLayout, writeGate]
  )

  const runPlan = useCallback(
    (steps: RidgeVisibilityStep[]) => {
      setGateError(null)
      return runInOrder(steps, runStep)
    },
    [runStep]
  )

  const commit = useCallback(
    async (arranged: TopbarLayoutItem[]) => {
      const next = restoreLayoutVisibility(arranged, layout)
      if (sameStoredLayout(next, layout)) return true
      setGateError(null)
      return commitLayout(next)
    },
    [layout, commitLayout]
  )

  const move = useCallback(
    (id: TopbarItemId, target: TopbarItemTarget) => commit(moveTopbarItem(items, id, target)),
    [items, commit]
  )

  const step = useCallback(
    (id: TopbarItemId, direction: TopbarStepDirection, isDrawn?: (id: TopbarItemId) => boolean) =>
      commit(stepTopbarItemPast(items, id, direction, isDrawn)),
    [items, commit]
  )

  const show = useCallback((id: TopbarItemId) => runPlan(showRidgeItemPlan(layout, gates, id)), [layout, gates, runPlan])

  const hide = useCallback((id: TopbarItemId) => runPlan(hideRidgeItemPlan(layout, gates, id)), [layout, gates, runPlan])

  const reset = useCallback(() => runPlan(resetRidgePlan()), [runPlan])

  return useMemo(
    () => ({
      layout,
      items,
      error: layoutError ?? gateError,
      isDefault: isDefaultRidge(layout, gates),
      commit,
      move,
      step,
      show,
      hide,
      reset,
    }),
    [layout, items, layoutError, gateError, gates, commit, move, step, show, hide, reset]
  )
}

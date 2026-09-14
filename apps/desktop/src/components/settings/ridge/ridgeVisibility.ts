import { settingsValueEntry } from '../../../settings/registry'
import { TOPBAR_ITEM_SETTING_GATES, isTopbarItemGated } from '../../topbar/layout/topbarLayout'
import { isDefaultTopbarArrangement, setTopbarItemVisible } from '../../topbar/layout/topbarLayoutEdits'

const RIDGE_GATED_ITEMS = Object.keys(TOPBAR_ITEM_SETTING_GATES) as TopbarGatedItemId[]

function gateShownByDefault(item: TopbarGatedItemId): boolean {
  return settingsValueEntry(TOPBAR_ITEM_SETTING_GATES[item]).defaultValue === true
}

function hiddenByGate(item: TopbarLayoutItem, gates: RidgeGates['visible']): boolean {
  return isTopbarItemGated(item.id) && !gates[item.id]
}

function withVisibility(item: TopbarLayoutItem, visible: boolean): TopbarLayoutItem {
  return item.visible === visible ? item : { ...item, visible }
}

export function effectiveRidgeItems(layout: TopbarLayoutItem[], gates: RidgeGates['visible']): TopbarLayoutItem[] {
  const effective = layout.map((item) => withVisibility(item, item.visible && !hiddenByGate(item, gates)))
  return effective.every((item, at) => item === layout[at]) ? layout : effective
}

export function restoreLayoutVisibility(
  arranged: TopbarLayoutItem[],
  layout: TopbarLayoutItem[]
): TopbarLayoutItem[] {
  const storedVisibility = new Map(layout.map((item) => [item.id, item.visible]))
  return arranged.map((item) => withVisibility(item, storedVisibility.get(item.id) ?? item.visible))
}

function layoutSteps(layout: TopbarLayoutItem[], next: TopbarLayoutItem[]): RidgeVisibilityStep[] {
  return next === layout ? [] : [{ kind: 'layout', items: next }]
}

function gateStep(item: TopbarGatedItemId, visible: boolean): RidgeVisibilityStep {
  return { kind: 'gate', item, visible }
}

function layoutShows(layout: TopbarLayoutItem[], id: TopbarItemId): boolean {
  return layout.some((item) => item.id === id && item.visible)
}

export function showRidgeItemPlan(
  layout: TopbarLayoutItem[],
  gates: RidgeGates['visible'],
  id: TopbarItemId
): RidgeVisibilityStep[] {
  const clearLayoutMark = layoutSteps(layout, setTopbarItemVisible(layout, id, true))
  if (!isTopbarItemGated(id) || gates[id]) return clearLayoutMark
  return [...clearLayoutMark, gateStep(id, true)]
}

export function hideRidgeItemPlan(
  layout: TopbarLayoutItem[],
  gates: RidgeGates['visible'],
  id: TopbarItemId
): RidgeVisibilityStep[] {
  if (!isTopbarItemGated(id)) return layoutSteps(layout, setTopbarItemVisible(layout, id, false))
  return gates[id] && layoutShows(layout, id) ? [gateStep(id, false)] : []
}

function defaultGateSteps(visible: boolean): RidgeVisibilityStep[] {
  return RIDGE_GATED_ITEMS.filter((item) => gateShownByDefault(item) === visible).map((item) =>
    gateStep(item, visible)
  )
}

export function resetRidgePlan(): RidgeVisibilityStep[] {
  return [...defaultGateSteps(false), { kind: 'layout-reset' }, ...defaultGateSteps(true)]
}

export function isDefaultRidge(layout: TopbarLayoutItem[], gates: RidgeGates['visible']): boolean {
  return (
    isDefaultTopbarArrangement(layout) && RIDGE_GATED_ITEMS.every((item) => gates[item] === gateShownByDefault(item))
  )
}

import { useMemo, useSyncExternalStore } from 'react'

let widgets: TopbarWidgetContribution[] = []
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot() {
  return widgets
}

export function registerContribution(contribution: TopbarWidgetContribution) {
  if (!contribution || contribution.type !== 'topbar-widget' || typeof contribution.component !== 'function') {
    return () => {}
  }
  const entry: TopbarWidgetContribution = {
    type: 'topbar-widget',
    id: String(contribution.id || `plugin-${widgets.length}`),
    component: contribution.component,
    slot: contribution.slot || 'right',
    order: typeof contribution.order === 'number' ? contribution.order : 0,
  }
  widgets = [...widgets.filter((widget) => widget.id !== entry.id), entry]
  emit()
  return () => {
    widgets = widgets.filter((widget) => widget !== entry)
    emit()
  }
}

export function clearWidgets() {
  if (widgets.length === 0) return
  widgets = []
  emit()
}

export function useTopbarWidgets(slot: TopbarSlot) {
  const all = useSyncExternalStore(subscribe, getSnapshot)
  return useMemo(
    () => all.filter((widget) => (widget.slot || 'right') === slot).sort((a, b) => (a.order || 0) - (b.order || 0)),
    [all, slot],
  )
}

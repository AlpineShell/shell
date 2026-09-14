import { useMemo } from 'react'
import { TOPBAR_ITEM_SETTING_GATES } from '../components/topbar/layout/topbarLayout'
import { settingsValueEntry } from '../settings/registry'
import { useSettingsValue, writeSettingsValue } from './useSettingsValue'

const GATE_ENTRIES: Record<TopbarGatedItemId, SettingsValueEntry> = {
  launcher: settingsValueEntry(TOPBAR_ITEM_SETTING_GATES.launcher),
  tray: settingsValueEntry(TOPBAR_ITEM_SETTING_GATES.tray),
}

function setRidgeGate(item: TopbarGatedItemId, visible: boolean): Promise<boolean> {
  return writeSettingsValue(GATE_ENTRIES[item], visible)
}

export function useRidgeGates(): RidgeGates {
  const launcher = useSettingsValue(GATE_ENTRIES.launcher).value === true
  const tray = useSettingsValue(GATE_ENTRIES.tray).value === true
  return useMemo(() => ({ visible: { launcher, tray }, setGate: setRidgeGate }), [launcher, tray])
}

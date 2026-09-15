const valuesByPlugin = new Map<string, PluginSettingValues>()
const pendingReads = new Map<string, Promise<PluginSettingValues>>()
const listeners = new Set<() => void>()
let listening = false

const UNSAVED_MESSAGE = 'Alpine could not save that setting.'

function emit() {
  for (const listener of [...listeners]) listener()
}

function remember(pluginId: string, values: PluginSettingValues) {
  valuesByPlugin.set(pluginId, values)
  emit()
}

function listenForChanges() {
  if (listening) return
  listening = true
  window.plugins.settings.onChanged((change) => remember(change.pluginId, change.values))
}

export function readPluginSettings(pluginId: string): Promise<PluginSettingValues> {
  listenForChanges()
  const pending = pendingReads.get(pluginId)
  if (pending) return pending
  const read = window.plugins.settings
    .get(pluginId)
    .then((values) => {
      remember(pluginId, values)
      return values
    })
    .finally(() => {
      pendingReads.delete(pluginId)
    })
  pendingReads.set(pluginId, read)
  return read
}

export function pluginSettingsSnapshot(pluginId: string): PluginSettingValues | undefined {
  return valuesByPlugin.get(pluginId)
}

export function subscribePluginSettings(listener: () => void): () => void {
  listenForChanges()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function onPluginSettingsChanged(pluginId: string, listener: (values: PluginSettingValues) => void): () => void {
  let last = valuesByPlugin.get(pluginId)
  return subscribePluginSettings(() => {
    const next = valuesByPlugin.get(pluginId)
    if (next === undefined || next === last) return
    last = next
    listener(next)
  })
}

function refusal(reason: unknown): PluginSettingWriteResult {
  return { ok: false, error: reason instanceof Error && reason.message ? reason.message : UNSAVED_MESSAGE }
}

export function writePluginSetting(pluginId: string, key: string, value: PluginSettingValue): Promise<PluginSettingWriteResult> {
  const before = valuesByPlugin.get(pluginId)
  if (before) remember(pluginId, { ...before, [key]: value })
  return window.plugins.settings
    .set(pluginId, key, value)
    .catch(refusal)
    .then((result) => {
      if (result.ok) remember(pluginId, result.values)
      else if (before) remember(pluginId, before)
      return result
    })
}

import { useCallback, useSyncExternalStore } from 'react'

interface SettingsValueStore {
  value: SettingsValue
  pendingWrites: number
  listeners: Set<() => void>
}

const storesByEntry = new Map<SettingsValueEntry, SettingsValueStore>()

function publish(store: SettingsValueStore, next: SettingsValue) {
  if (store.value === next) return
  store.value = next
  for (const listener of store.listeners) listener()
}

function accept(entry: SettingsValueEntry, store: SettingsValueStore, next: SettingsValue) {
  if (store.pendingWrites > 0) return
  publish(store, entry.validate ? entry.validate(next) : next)
}

function settingsValueStore(entry: SettingsValueEntry): SettingsValueStore {
  const existing = storesByEntry.get(entry)
  if (existing) return existing

  const store: SettingsValueStore = {
    value: entry.initial ? entry.initial() : entry.defaultValue,
    pendingWrites: 0,
    listeners: new Set(),
  }
  storesByEntry.set(entry, store)
  entry.read().then((current) => accept(entry, store, current)).catch(() => {})
  entry.subscribe?.((current) => accept(entry, store, current))
  return store
}

function writeSettingsValue(entry: SettingsValueEntry, next: SettingsValue) {
  const store = settingsValueStore(entry)
  store.pendingWrites += 1
  publish(store, next)
  Promise.resolve(entry.write(next))
    .catch(() => entry.read().then((current) => publish(store, current)).catch(() => {}))
    .finally(() => {
      store.pendingWrites -= 1
    })
}

export function toggleSettingsValue(entry: SettingsValueEntry) {
  writeSettingsValue(entry, settingsValueStore(entry).value !== true)
}

export function useSettingsValue(entry: SettingsValueEntry) {
  const store = settingsValueStore(entry)

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      store.listeners.add(onStoreChange)
      return () => {
        store.listeners.delete(onStoreChange)
      }
    },
    [store]
  )

  const value = useSyncExternalStore(subscribe, () => store.value)

  return { value, write: (next: SettingsValue) => writeSettingsValue(entry, next) }
}

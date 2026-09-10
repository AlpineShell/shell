import { useCallback, useSyncExternalStore } from 'react'

interface SettingsValueStore {
  entry: SettingsValueEntry
  snapshot: SettingsValueSnapshot
  pendingWrites: number
  listeners: Set<() => void>
}

const STAGED_APPLIES: SettingsApplies[] = ['confirm', 'draft']

const storesByEntry = new Map<SettingsValueEntry, SettingsValueStore>()

interface GroupSnapshot {
  snapshots: SettingsValueSnapshot[]
  values: Record<string, SettingsValue>
}

const groupSnapshots = new WeakMap<SettingsValueEntry[], GroupSnapshot>()

function groupSnapshot(entries: SettingsValueEntry[]): Record<string, SettingsValue> {
  const snapshots = entries.map((entry) => settingsValueStore(entry).snapshot)
  const previous = groupSnapshots.get(entries)
  if (previous && previous.snapshots.every((snapshot, index) => snapshot === snapshots[index])) {
    return previous.values
  }
  const values: Record<string, SettingsValue> = {}
  entries.forEach((entry, index) => {
    values[entry.id] = snapshots[index].value
  })
  groupSnapshots.set(entries, { snapshots, values })
  return values
}

function update(store: SettingsValueStore, changes: Partial<SettingsValueSnapshot>) {
  const current = store.snapshot
  const next = { ...current, ...changes }
  if (
    next.value === current.value &&
    next.staged === current.staged &&
    next.restartRequired === current.restartRequired &&
    next.error === current.error
  ) {
    return
  }
  store.snapshot = next
  for (const listener of store.listeners) listener()
}

function accept(store: SettingsValueStore, next: SettingsValue) {
  if (store.pendingWrites > 0) return
  update(store, { value: store.entry.validate ? store.entry.validate(next) : next })
}

function settingsValueStore(entry: SettingsValueEntry): SettingsValueStore {
  const existing = storesByEntry.get(entry)
  if (existing) return existing

  const store: SettingsValueStore = {
    entry,
    snapshot: {
      value: entry.initial ? entry.initial() : entry.defaultValue,
      staged: undefined,
      restartRequired: false,
      error: null,
    },
    pendingWrites: 0,
    listeners: new Set(),
  }
  storesByEntry.set(entry, store)
  entry.read().then((current) => accept(store, current)).catch(() => {})
  entry.subscribe?.((current) => accept(store, current))
  return store
}

function refusedMessage(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason ?? '')
  return message.trim().length > 0 ? message : 'Alpine could not apply that.'
}

function commit(store: SettingsValueStore, next: SettingsValue) {
  const entry = store.entry
  store.pendingWrites += 1
  update(store, { value: next, staged: undefined, error: null })
  Promise.resolve(entry.write(next))
    .then(() => {
      if (entry.applies === 'restart') update(store, { restartRequired: true })
    })
    .catch((reason: unknown) => {
      update(store, { error: refusedMessage(reason) })
      return entry.read().then((current) => update(store, { value: current })).catch(() => {})
    })
    .finally(() => {
      store.pendingWrites -= 1
    })
}

export function writeSettingsValue(entry: SettingsValueEntry, next: SettingsValue) {
  const store = settingsValueStore(entry)
  if (STAGED_APPLIES.includes(entry.applies)) {
    update(store, { staged: next, error: null })
    return
  }
  commit(store, next)
}

export function confirmSettingsValue(entry: SettingsValueEntry) {
  const store = settingsValueStore(entry)
  const staged = store.snapshot.staged
  if (staged === undefined) return
  commit(store, staged)
}

export function discardSettingsValue(entry: SettingsValueEntry) {
  update(settingsValueStore(entry), { staged: undefined, error: null })
}

export function toggleSettingsValue(entry: SettingsValueEntry) {
  const snapshot = settingsValueStore(entry).snapshot
  writeSettingsValue(entry, (snapshot.staged ?? snapshot.value) !== true)
}

export function useSettingsValue(entry: SettingsValueEntry): SettingsValueBinding {
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

  const snapshot = useSyncExternalStore(subscribe, () => store.snapshot)

  return {
    value: snapshot.value,
    staged: snapshot.staged,
    restartRequired: snapshot.restartRequired,
    error: snapshot.error,
    write: (next: SettingsValue) => writeSettingsValue(entry, next),
    confirm: () => confirmSettingsValue(entry),
    cancel: () => discardSettingsValue(entry),
  }
}

export function useSettingsValues(entries: SettingsValueEntry[]): Record<string, SettingsValue> {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const stores = entries.map(settingsValueStore)
      for (const store of stores) store.listeners.add(onStoreChange)
      return () => {
        for (const store of stores) store.listeners.delete(onStoreChange)
      }
    },
    [entries]
  )

  return useSyncExternalStore(subscribe, () => groupSnapshot(entries))
}

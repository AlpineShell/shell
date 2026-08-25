const BUILTIN_MONITOR_KEY = 'builtin:display'
const LEGACY_BUILTIN_MONITOR_ID = 'internal'
const EDID_KEY_PREFIX = 'panel:'
const PORT_KEY_PREFIX = 'port:'

const DEVICE_INTERFACE_PREFIX = /^\\\\[?.]\\/
const GUID_SEGMENT = /^\{[0-9a-fA-F-]+\}$/
const INSTANCE_INDEX_SUFFIX = /_\d+$/

const MAX_EDID_RESOLUTION_ATTEMPTS = 3

function normalizeInstancePath(value) {
  if (typeof value !== 'string') return null
  const segments = value
    .replace(DEVICE_INTERFACE_PREFIX, '')
    .replace(/#/g, '\\')
    .split('\\')
    .filter(segment => segment && !GUID_SEGMENT.test(segment))
  if (segments.length < 2) return null
  segments[segments.length - 1] = segments[segments.length - 1].replace(INSTANCE_INDEX_SUFFIX, '')
  return segments.join('\\').toUpperCase()
}

function normalizeEdidField(value) {
  if (typeof value !== 'string') return ''
  return value.replace(/[^0-9A-Za-z]/g, '').toUpperCase()
}

function edidMonitorKey(edid) {
  if (!edid) return null
  const serial = normalizeEdidField(edid.serial)
  if (!serial) return null
  const manufacturer = normalizeEdidField(edid.manufacturer) || 'UNKNOWN'
  const productCode = normalizeEdidField(edid.productCode) || 'UNKNOWN'
  return `${EDID_KEY_PREFIX}${manufacturer}-${productCode}-${serial}`
}

function portMonitorKey(instancePath) {
  const normalized = normalizeInstancePath(instancePath)
  return normalized ? `${PORT_KEY_PREFIX}${normalized}` : null
}

function countKeys(keys) {
  const counts = new Map()
  for (const key of keys) {
    if (!key) continue
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

function assignStableMonitorKeys(descriptors, attachedPanelEdids) {
  const candidates = (descriptors ?? []).map(descriptor => ({
    id: descriptor.id,
    edidKey: edidMonitorKey(descriptor.edid),
    portKey: portMonitorKey(descriptor.instancePath),
  }))
  const edidKeyCounts = countKeys(attachedPanelEdids
    ? [...attachedPanelEdids].map(edidMonitorKey)
    : candidates.map(candidate => candidate.edidKey))
  const keys = new Map()
  for (const candidate of candidates) {
    const unambiguousEdidKey = candidate.edidKey && edidKeyCounts.get(candidate.edidKey) === 1
      ? candidate.edidKey
      : null
    keys.set(candidate.id, unambiguousEdidKey ?? candidate.portKey ?? null)
  }
  return keys
}

function attachedPortSignature(instancePaths) {
  const ports = (instancePaths ?? []).map(normalizeInstancePath).filter(Boolean)
  return [...new Set(ports)].sort().join('|')
}

function createMonitorIdentityCache() {
  const instancePathByAdapter = new Map()
  const stableKeyByInstancePath = new Map()
  let resolvedPortSignature = null
  let invalidationEpoch = 0

  function instancePathForAdapter(adapterDeviceName, readInstancePath) {
    if (!adapterDeviceName) return null
    if (!instancePathByAdapter.has(adapterDeviceName)) {
      instancePathByAdapter.set(adapterDeviceName, readInstancePath(adapterDeviceName) ?? null)
    }
    return instancePathByAdapter.get(adapterDeviceName)
  }

  function rememberedStableKey(instancePath) {
    const normalized = normalizeInstancePath(instancePath)
    if (!normalized) return null
    return stableKeyByInstancePath.get(normalized) ?? null
  }

  function rememberResolution(displays, keysById) {
    for (const display of displays) {
      const normalized = normalizeInstancePath(display.instancePath)
      const stableKey = keysById.get(display.id)
      if (normalized && stableKey) stableKeyByInstancePath.set(normalized, stableKey)
    }
    resolvedPortSignature = attachedPortSignature(displays.map(display => display.instancePath))
  }

  function rememberedKeysFor(displays) {
    return new Map(displays.map(display => [display.id, rememberedStableKey(display.instancePath)]))
  }

  function unresolvedKeysFor(displays) {
    return new Map(displays.map(display => [display.id, null]))
  }

  async function stableKeysForDisplays(displays, readEdidRows) {
    const attached = displays ?? []
    const signature = attachedPortSignature(attached.map(display => display.instancePath))
    if (signature === resolvedPortSignature) return rememberedKeysFor(attached)
    for (let attempt = 0; attempt < MAX_EDID_RESOLUTION_ATTEMPTS; attempt++) {
      const epochWhenQueried = invalidationEpoch
      const edidByInstancePath = await readEdidRows()
      if (epochWhenQueried !== invalidationEpoch) continue
      const keysById = assignStableMonitorKeys(attached.map(display => ({
        id: display.id,
        instancePath: display.instancePath,
        edid: edidByInstancePath.get(normalizeInstancePath(display.instancePath) ?? '') ?? null,
      })), edidByInstancePath.values())
      rememberResolution(attached, keysById)
      return keysById
    }
    return unresolvedKeysFor(attached)
  }

  function invalidate() {
    instancePathByAdapter.clear()
    stableKeyByInstancePath.clear()
    resolvedPortSignature = null
    invalidationEpoch++
  }

  return { instancePathForAdapter, rememberedStableKey, stableKeysForDisplays, invalidate }
}

function isPersistableMonitorKey(key) {
  if (typeof key !== 'string') return false
  return key === BUILTIN_MONITOR_KEY || key.startsWith(EDID_KEY_PREFIX) || key.startsWith(PORT_KEY_PREFIX)
}

function migratedMonitorKey(key) {
  return key === LEGACY_BUILTIN_MONITOR_ID ? BUILTIN_MONITOR_KEY : key
}

function migratePersistedBaselines(stored) {
  const baselines = new Map()
  const discarded = []
  for (const [key, value] of Object.entries(stored ?? {})) {
    const migrated = migratedMonitorKey(key)
    if (typeof value !== 'number' || !Number.isFinite(value) || !isPersistableMonitorKey(migrated)) {
      discarded.push(key)
      continue
    }
    baselines.set(migrated, value)
  }
  return { baselines, discarded }
}

function parseMonitorEdidRows(stdout) {
  const byInstancePath = new Map()
  for (const line of String(stdout ?? '').split(/\r?\n/)) {
    const fields = line.trim().split('|')
    if (fields.length < 4) continue
    const instancePath = normalizeInstancePath(fields[0])
    if (!instancePath) continue
    byInstancePath.set(instancePath, {
      manufacturer: fields[1].trim(),
      productCode: fields[2].trim(),
      serial: fields[3].trim(),
    })
  }
  return byInstancePath
}

module.exports = {
  BUILTIN_MONITOR_KEY,
  LEGACY_BUILTIN_MONITOR_ID,
  EDID_KEY_PREFIX,
  PORT_KEY_PREFIX,
  normalizeInstancePath,
  edidMonitorKey,
  portMonitorKey,
  assignStableMonitorKeys,
  attachedPortSignature,
  createMonitorIdentityCache,
  isPersistableMonitorKey,
  migratePersistedBaselines,
  parseMonitorEdidRows,
}

const koffi = require('koffi')
const fs = require('fs')
const path = require('path')
const { app, screen } = require('electron')
const { clampBrightnessPercent, dimmedBrightness, displaysToDim } = require('./batterySaverPolicy')
const { createBatterySaverBaselines } = require('./batterySaverBaselines')
const { skippedWhileStillRunning } = require('../skippedWhileStillRunning')
const {
  BUILTIN_MONITOR_KEY,
  createMonitorIdentityCache,
  portMonitorKey,
} = require('./monitorIdentity')
const { loadBrightnessWmi } = require('./brightnessWmi')


const user32 = koffi.load('user32.dll')

let dxva2
try { dxva2 = koffi.load('dxva2.dll') } catch (_) { dxva2 = null }

const MonitorFromRect = user32.func(
  '__stdcall', 'MonitorFromRect', 'uintptr_t',
  ['void *', 'uint32']
)
const GetMonitorInfoW = user32.func(
  '__stdcall', 'GetMonitorInfoW', 'int',
  ['uintptr_t', 'void *']
)
const EnumDisplayDevicesW = user32.func(
  '__stdcall', 'EnumDisplayDevicesW', 'int',
  ['str16', 'uint32', 'void *', 'uint32']
)

let GetNumberOfPhysicalMonitorsFromHMONITOR,
    GetPhysicalMonitorsFromHMONITOR,
    GetMonitorBrightnessAPI,
    SetMonitorBrightnessAPI,
    DestroyPhysicalMonitorsAPI

if (dxva2) {
  GetNumberOfPhysicalMonitorsFromHMONITOR = dxva2.func(
    '__stdcall', 'GetNumberOfPhysicalMonitorsFromHMONITOR', 'int',
    ['uintptr_t', 'void *']
  )
  GetPhysicalMonitorsFromHMONITOR = dxva2.func(
    '__stdcall', 'GetPhysicalMonitorsFromHMONITOR', 'int',
    ['uintptr_t', 'uint32', 'void *']
  )
  GetMonitorBrightnessAPI = dxva2.func(
    '__stdcall', 'GetMonitorBrightness', 'int',
    ['uintptr_t', 'void *', 'void *', 'void *']
  )
  SetMonitorBrightnessAPI = dxva2.func(
    '__stdcall', 'SetMonitorBrightness', 'int',
    ['uintptr_t', 'uint32']
  )
  DestroyPhysicalMonitorsAPI = dxva2.func(
    '__stdcall', 'DestroyPhysicalMonitors', 'int',
    ['uint32', 'void *']
  )
}


const HANDLE_SIZE = 8
const PHYS_MON_SIZE = HANDLE_SIZE + 128 * 2

const MONINFO_SIZE = 104

const DISPLAY_DEVICE_SIZE = 840
const DISPLAY_DEVICE_ID_OFFSET = 328
const DISPLAY_DEVICE_ID_MAX_CHARS = 128
const EDD_GET_DEVICE_INTERFACE_NAME = 0x00000001

const BATTERY_SAVER_BASELINE_FILE = 'battery-saver-brightness.json'
const SHUTDOWN_INTERNAL_WRITE_TIMEOUT_MS = 2000
const DISPLAY_CHANGE_SETTLE_MS = 1500
const BRIGHTNESS_READBACK_TOLERANCE_PERCENT = 2
const INTERNAL_BRIGHTNESS_EVENT_SETTLE_MS = 250


let monitors = []
let lastStateJson = null
let hasInternalDisplay = null
let brightnessWriteCount = 0
let broadcastRef = null
let enumeratePending = null
let baselineStorePath = null
let displayChangeTimer = null
let desiredBatterySaverReduction = null
let desiredExternalDisplayDimming = false
let batterySaverSettleRunning = false
let brightnessWmiBackend = null
let internalBrightnessWatched = false
let internalWritesInFlight = 0
let observedInternalBrightness = null
let internalBrightnessEventTimer = null
const brightnessWritesByMonitorKey = new Map()
const brightnessWritableByMonitorKey = new Map()
const monitorIdentityCache = createMonitorIdentityCache()
const batterySaverBaselines = createBatterySaverBaselines()


function readWideString(buf, offset, maxChars) {
  for (let i = 0; i < maxChars; i++) {
    if (buf.readUInt16LE(offset + i * 2) === 0)
      return buf.slice(offset, offset + i * 2).toString('utf16le')
  }
  return buf.slice(offset, offset + maxChars * 2).toString('utf16le')
}

function cleanName(physName, deviceName, index) {
  if (physName && physName !== 'Generic PnP Monitor' && physName !== 'Generic Monitor')
    return physName
  const m = deviceName?.match(/DISPLAY(\d+)/i)
  if (m) return `Display ${m[1]}`
  return `Display ${index + 1}`
}


function brightnessWmi() {
  if (!brightnessWmiBackend) brightnessWmiBackend = loadBrightnessWmi()
  return brightnessWmiBackend
}

const MONITOR_DEFAULTTONEAREST = 0x02

function enumLogicalMonitors() {
  const displays = screen.getAllDisplays()
  const results = []
  const seen = new Set()
  for (const d of displays) {
    const bounds = screen.dipToScreenRect(null, d.bounds)
    const rect = Buffer.alloc(16)
    rect.writeInt32LE(bounds.x, 0)
    rect.writeInt32LE(bounds.y, 4)
    rect.writeInt32LE(bounds.x + bounds.width, 8)
    rect.writeInt32LE(bounds.y + bounds.height, 12)
    const h = MonitorFromRect(rect, MONITOR_DEFAULTTONEAREST)
    if (h && !seen.has(h)) {
      seen.add(h)
      results.push(h)
    }
  }
  return results
}

function getDeviceName(hMon) {
  const buf = Buffer.alloc(MONINFO_SIZE)
  buf.writeUInt32LE(MONINFO_SIZE, 0)
  if (!GetMonitorInfoW(hMon, buf)) return null
  return readWideString(buf, 40, 32)
}

function readMonitorInstancePath(adapterDeviceName) {
  const buf = Buffer.alloc(DISPLAY_DEVICE_SIZE)
  buf.writeUInt32LE(DISPLAY_DEVICE_SIZE, 0)
  if (!EnumDisplayDevicesW(adapterDeviceName, 0, buf, EDD_GET_DEVICE_INTERFACE_NAME)) return null
  return readWideString(buf, DISPLAY_DEVICE_ID_OFFSET, DISPLAY_DEVICE_ID_MAX_CHARS) || null
}

function monitorCacheKey(monitor) {
  return monitor.stableKey ?? monitor.id
}

const DDC_CALL_TIMEOUT_MS = 4000

const UNANSWERED_DDC_CALL = { succeeded: false, answered: false }

function offMainThread(api, args) {
  return new Promise((resolve) => {
    let timeout = null
    let settled = false
    const settle = (outcome) => {
      if (settled) return
      settled = true
      if (timeout) clearTimeout(timeout)
      resolve(outcome)
    }
    timeout = setTimeout(() => {
      console.error(`[brightness] DDC/CI call did not answer within ${DDC_CALL_TIMEOUT_MS} ms`)
      settle(UNANSWERED_DDC_CALL)
    }, DDC_CALL_TIMEOUT_MS)
    try {
      api.async(...args, (err, result) => settle({ succeeded: !err && !!result, answered: !err }))
    } catch (_) {
      settle(UNANSWERED_DDC_CALL)
    }
  })
}

async function getPhysicalMonitors(hMon) {
  if (!dxva2) return []
  const countBuf = Buffer.alloc(4)
  if (!(await offMainThread(GetNumberOfPhysicalMonitorsFromHMONITOR, [hMon, countBuf])).succeeded) return []
  const count = countBuf.readUInt32LE(0)
  if (!count) return []

  const buf = Buffer.alloc(PHYS_MON_SIZE * count)
  if (!(await offMainThread(GetPhysicalMonitorsFromHMONITOR, [hMon, count, buf])).succeeded) return []

  const result = []
  for (let i = 0; i < count; i++) {
    const off = i * PHYS_MON_SIZE
    result.push({
      handle: buf.readBigUInt64LE(off),
      name: readWideString(buf, off + HANDLE_SIZE, 128),
    })
  }
  return result
}

async function destroyPhysicalHandle(handle) {
  if (!dxva2 || !handle) return
  const buf = Buffer.alloc(PHYS_MON_SIZE)
  buf.writeBigUInt64LE(handle, 0)
  await offMainThread(DestroyPhysicalMonitorsAPI, [1, buf])
}


let pendingDdcWork = Promise.resolve()

function queueDdcWork(task) {
  const result = pendingDdcWork.then(task, task)
  pendingDdcWork = result.then(() => undefined, () => undefined)
  return result
}

function withPhysicalMonitor(hMon, fn) {
  return queueDdcWork(async () => {
    const physMonitors = await getPhysicalMonitors(hMon)
    try {
      return await fn(physMonitors)
    } finally {
      for (const p of physMonitors) await destroyPhysicalHandle(p.handle)
    }
  })
}

async function ddcGetBrightness(hPhysical) {
  const min = Buffer.alloc(4), cur = Buffer.alloc(4), max = Buffer.alloc(4)
  if (!(await offMainThread(GetMonitorBrightnessAPI, [hPhysical, min, cur, max])).succeeded) return null
  return {
    current: cur.readUInt32LE(0),
    max: max.readUInt32LE(0),
  }
}

function ddcSetBrightness(hPhysical, rawValue) {
  return offMainThread(SetMonitorBrightnessAPI, [hPhysical, rawValue])
}

function ddcRawValue(monitor, percent) {
  return Math.round((percent / 100) * (monitor.ddcMax || 100))
}


async function writeInternalBrightness(percent) {
  observedInternalBrightness = null
  internalWritesInFlight++
  try {
    return await brightnessWmi().writeBrightness(percent)
  } finally {
    internalWritesInFlight--
  }
}

function adoptObservedInternalBrightness() {
  internalBrightnessEventTimer = null
  if (internalWritesInFlight > 0) {
    scheduleObservedInternalBrightness()
    return
  }
  const observed = observedInternalBrightness
  observedInternalBrightness = null
  const internal = monitors.find(m => m.type === 'internal')
  if (!internal || observed === null) return
  noteObservedBrightness(internal, observed)
  if (internal.brightness === observed) return
  internal.brightness = observed
  publishMonitors()
}

function scheduleObservedInternalBrightness() {
  clearTimeout(internalBrightnessEventTimer)
  internalBrightnessEventTimer = setTimeout(adoptObservedInternalBrightness, INTERNAL_BRIGHTNESS_EVENT_SETTLE_MS)
}

function onInternalBrightnessEvent(brightness) {
  observedInternalBrightness = brightness
  scheduleObservedInternalBrightness()
}

function onInternalBrightnessWatchFailed(error) {
  internalBrightnessWatched = false
  console.error('[brightness] stopped watching the built-in display brightness, polling instead:', error?.message ?? error)
}

function watchInternalBrightness() {
  if (!hasInternalDisplay || internalBrightnessWatched) return
  internalBrightnessWatched = true
  brightnessWmi().watchBrightness(onInternalBrightnessEvent, onInternalBrightnessWatchFailed)
}

function recordBrightnessWrite(monitor, brightness) {
  const cacheKey = monitorCacheKey(monitor)
  brightnessWriteCount++
  brightnessWritesByMonitorKey.set(cacheKey, { brightness, writeCount: brightnessWriteCount })
  const live = monitors.find(m => monitorCacheKey(m) === cacheKey)
  if (live) live.brightness = brightness
}

function adoptBrightnessWritesSince(newMonitors, writeCount) {
  for (const m of newMonitors) {
    const write = brightnessWritesByMonitorKey.get(monitorCacheKey(m))
    if (write && write.writeCount > writeCount) m.brightness = write.brightness
  }
}

function forgetBrightnessWritesForAbsentMonitors() {
  const presentKeys = new Set(monitors.map(monitorCacheKey))
  for (const cacheKey of brightnessWritesByMonitorKey.keys()) {
    if (!presentKeys.has(cacheKey)) brightnessWritesByMonitorKey.delete(cacheKey)
  }
  for (const cacheKey of brightnessWritableByMonitorKey.keys()) {
    if (!presentKeys.has(cacheKey)) brightnessWritableByMonitorKey.delete(cacheKey)
  }
}

function forgetMonitorWriteState() {
  brightnessWritesByMonitorKey.clear()
  brightnessWritableByMonitorKey.clear()
}

async function enumerate() {
  const writeCountAtStart = brightnessWriteCount
  const newMonitors = []

  if (dxva2) {
    for (const hMon of enumLogicalMonitors()) {
      const deviceName = getDeviceName(hMon)
      await withPhysicalMonitor(hMon, async (physMonitors) => {
        for (const phys of physMonitors) {
          try {
            const b = await ddcGetBrightness(phys.handle)
            if (b) {
              const brightness = b.max > 0
                ? Math.round((b.current / b.max) * 100)
                : b.current
              const instancePath = monitorIdentityCache.instancePathForAdapter(deviceName, readMonitorInstancePath)
              const id = deviceName || `ddc-${newMonitors.length}`
              const stableKey = monitorIdentityCache.rememberedStableKey(instancePath)
              newMonitors.push({
                id,
                name: cleanName(phys.name, deviceName, newMonitors.length),
                type: 'external',
                brightness,
                hMon,
                ddcMax: b.max || 100,
                instancePath,
                stableKey,
                brightnessWritable: brightnessWritableByMonitorKey.get(stableKey ?? id) ?? true,
              })
            }
          } catch (_) {}
        }
      })
    }
  }

  let internalBrightness
  if (hasInternalDisplay === null) {
    const probe = await brightnessWmi().probeInternalAndBrightness()
    hasInternalDisplay = probe.hasInternal
    internalBrightness = probe.brightness
  } else if (hasInternalDisplay) {
    internalBrightness = await brightnessWmi().readBrightness()
  }

  if (hasInternalDisplay && internalBrightness != null) {
    newMonitors.push({
      id: 'internal',
      name: 'Built-in Display',
      type: 'internal',
      brightness: internalBrightness,
      hMon: null,
      ddcMax: null,
      instancePath: null,
      stableKey: BUILTIN_MONITOR_KEY,
      brightnessWritable: brightnessWritableByMonitorKey.get(BUILTIN_MONITOR_KEY) ?? true,
    })
  }

  adoptBrightnessWritesSince(newMonitors, writeCountAtStart)
  monitors = newMonitors
  forgetBrightnessWritesForAbsentMonitors()
  return publicState()
}

function ensureMonitorsEnumerated() {
  if (monitors.length) return Promise.resolve()
  if (!enumeratePending) enumeratePending = enumerate().finally(() => { enumeratePending = null })
  return enumeratePending.then(() => undefined)
}

async function readMonitorEdid() {
  try {
    return await brightnessWmi().readMonitorEdid()
  } catch (e) {
    console.error('[brightness] could not read the monitor EDID identities:', e?.message ?? e)
    return new Map()
  }
}

async function resolveExternalStableKeys() {
  const externals = monitors.filter(m => m.type === 'external')
  if (!externals.length) return
  const keysById = await monitorIdentityCache.stableKeysForDisplays(externals, readMonitorEdid)
  for (const m of externals) {
    m.stableKey = keysById.get(m.id) ?? null
    if (!m.stableKey) console.error('[brightness] no stable identity for display', m.name, `(${m.id}) — battery saver will leave it alone`)
  }
}


async function refresh() {
  const sweptMonitors = monitors
  let changed = false

  for (const m of sweptMonitors) {
    if (monitors !== sweptMonitors) return false
    if (m.type !== 'external' || !m.hMon) continue
    await withPhysicalMonitor(m.hMon, async (physMonitors) => {
      for (const phys of physMonitors) {
        try {
          const b = await ddcGetBrightness(phys.handle)
          if (b) {
            const val = b.max > 0
              ? Math.round((b.current / b.max) * 100)
              : b.current
            if (val !== m.brightness) { m.brightness = val; changed = true }
            noteObservedBrightness(m, val)
          }
        } catch (_) {}
      }
    })
  }

  const internal = sweptMonitors.find(m => m.type === 'internal')
  if (internal) {
    const val = await brightnessWmi().readBrightness()
    if (val !== null) {
      if (val !== internal.brightness) {
        internal.brightness = val
        changed = true
      }
      noteObservedBrightness(internal, val)
    }
  }

  return changed && monitors === sweptMonitors
}


async function ddcWriteBrightness(monitor, percent) {
  const rawValue = ddcRawValue(monitor, percent)
  return withPhysicalMonitor(monitor.hMon, async (physMonitors) => {
    let accepted = false
    let answered = false
    for (const phys of physMonitors) {
      const outcome = await ddcSetBrightness(phys.handle, rawValue)
      if (outcome.succeeded) accepted = true
      if (outcome.answered) answered = true
    }
    return { accepted, answered }
  })
}

function noteBrightnessWriteOutcome(monitor, { accepted, answered }) {
  if (!answered) {
    console.error('[brightness] no answer to a brightness write from', monitor.name, `(${monitor.id}) — leaving it marked as it was`)
    return
  }
  brightnessWritableByMonitorKey.set(monitorCacheKey(monitor), accepted)
  if (monitor.brightnessWritable === accepted) return
  monitor.brightnessWritable = accepted
  if (!accepted) console.error('[brightness] the display rejected a brightness write:', monitor.name, `(${monitor.id})`)
  publishMonitors()
}

async function writeMonitorBrightness(id, value) {
  const clamped = clampBrightnessPercent(value)
  const m = monitors.find(x => x.id === id)
  if (!m) return { accepted: false, value: clamped }

  let outcome = { accepted: false, answered: false }
  if (m.type === 'internal') outcome = await writeInternalBrightness(clamped)
  else if (m.hMon) outcome = await ddcWriteBrightness(m, clamped)

  noteBrightnessWriteOutcome(m, outcome)
  if (outcome.accepted) recordBrightnessWrite(m, clamped)
  return { accepted: outcome.accepted, value: clamped }
}

async function setMonitorBrightness(id, value) {
  const stableKey = monitors.find(m => m.id === id)?.stableKey ?? null
  const { accepted, value: clamped } = await writeMonitorBrightness(id, value)
  if (accepted) {
    forgetBatterySaverBaseline(stableKey)
    return clamped
  }
  return monitors.find(m => m.id === id)?.brightness ?? clamped
}

function publicState() {
  return monitors.map(m => ({
    id: m.id,
    name: m.name,
    type: m.type,
    brightness: m.brightness,
    brightnessWritable: m.brightnessWritable !== false,
  }))
}

function publishMonitors() {
  const state = publicState()
  lastStateJson = JSON.stringify(state)
  if (broadcastRef) broadcastRef('system/monitors-changed', state)
}


function getBaselineStorePath() {
  if (!baselineStorePath) baselineStorePath = path.join(app.getPath('userData'), BATTERY_SAVER_BASELINE_FILE)
  return baselineStorePath
}

function persistBatterySaverBaselines() {
  try {
    const file = getBaselineStorePath()
    if (!batterySaverBaselines.size()) {
      fs.rmSync(file, { force: true })
      return
    }
    fs.writeFileSync(file, JSON.stringify(batterySaverBaselines.toStoredObject()))
  } catch (e) {
    console.error('[brightness] could not persist the battery saver baseline:', e?.message ?? e)
  }
}

function loadPersistedBatterySaverBaselines() {
  try {
    const file = getBaselineStorePath()
    if (!fs.existsSync(file)) return
    const discarded = batterySaverBaselines.loadStored(JSON.parse(fs.readFileSync(file, 'utf8')))
    if (!discarded.length) return
    console.error('[brightness] discarded battery saver baselines that no longer name a known display:', discarded.join(', '))
    persistBatterySaverBaselines()
  } catch (e) {
    console.error('[brightness] could not read the battery saver baseline:', e?.message ?? e)
  }
}

function forgetBatterySaverBaseline(stableKey) {
  if (batterySaverBaselines.forget(stableKey)) persistBatterySaverBaselines()
}

function noteObservedBrightness(monitor, observed) {
  if (!batterySaverBaselines.isUnexpectedBrightness(monitor.stableKey, observed, BRIGHTNESS_READBACK_TOLERANCE_PERCENT)) return
  forgetBatterySaverBaseline(monitor.stableKey)
}

async function restoreBaselines(stableKeys) {
  let changed = false
  for (const stableKey of stableKeys) {
    const target = monitors.find(m => m.stableKey === stableKey)
    if (!target) continue
    const { accepted } = await writeMonitorBrightness(target.id, batterySaverBaselines.baselineFor(stableKey))
    if (batterySaverBaselines.finishRestoreAttempt(stableKey, accepted)) changed = true
  }
  return changed
}

function baselinesOutsideDimSet(dimTargets) {
  const dimmedKeys = new Set(dimTargets.map(m => m.stableKey))
  return batterySaverBaselines.keys().filter(stableKey => !dimmedKeys.has(stableKey))
}

async function dimForBatterySaver(reductionPercent, includeExternalDisplays) {
  const dimTargets = displaysToDim(monitors, includeExternalDisplays)
  let changed = await restoreBaselines(baselinesOutsideDimSet(dimTargets))
  for (const target of dimTargets) {
    const stableKey = target.stableKey
    const { isFirstAttempt, baseline } = batterySaverBaselines.beginDimAttempt(stableKey, target.brightness)
    const dimmedTo = dimmedBrightness(baseline, reductionPercent)
    if (batterySaverBaselines.appliedFor(stableKey) === dimmedTo) continue
    const { accepted } = await writeMonitorBrightness(target.id, dimmedTo)
    if (batterySaverBaselines.finishDimAttempt(stableKey, { isFirstAttempt, dimmedTo, accepted })) changed = true
  }
  if (changed) {
    persistBatterySaverBaselines()
    publishMonitors()
  }
}

async function restoreFromBatterySaver() {
  if (await restoreBaselines(batterySaverBaselines.keys())) {
    persistBatterySaverBaselines()
    publishMonitors()
  }
}

function settlementMatchesRequest(settled) {
  return !!settled
    && settled.reduction === desiredBatterySaverReduction
    && settled.external === desiredExternalDisplayDimming
}

async function settleBatterySaver() {
  if (batterySaverSettleRunning) return
  batterySaverSettleRunning = true
  try {
    let settled = null
    while (!settlementMatchesRequest(settled)) {
      settled = { reduction: desiredBatterySaverReduction, external: desiredExternalDisplayDimming }
      await ensureMonitorsEnumerated()
      if (settled.external || batterySaverBaselines.holdsKeyOtherThan(BUILTIN_MONITOR_KEY)) await resolveExternalStableKeys()
      if (settled.reduction === null) await restoreFromBatterySaver()
      else await dimForBatterySaver(settled.reduction, settled.external)
    }
  } catch (e) {
    console.error('[brightness] battery saver dimming failed:', e?.message ?? e)
  } finally {
    batterySaverSettleRunning = false
  }
}

function applyBatterySaverDimming(reductionPercent, includeExternalDisplays) {
  desiredBatterySaverReduction = reductionPercent
  desiredExternalDisplayDimming = !!includeExternalDisplays
  return settleBatterySaver()
}

function clearBatterySaverDimming() {
  desiredBatterySaverReduction = null
  desiredExternalDisplayDimming = false
  return settleBatterySaver()
}

function resweepAfterDisplayChange() {
  clearTimeout(displayChangeTimer)
  displayChangeTimer = setTimeout(() => {
    monitorIdentityCache.invalidate()
    forgetMonitorWriteState()
    enumerate()
      .then(() => {
        publishMonitors()
        watchInternalBrightness()
        return settleBatterySaver()
      })
      .catch((e) => console.error('[brightness] display change sweep failed:', e?.message ?? e))
  }, DISPLAY_CHANGE_SETTLE_MS)
}


function writeDdcBrightnessSynchronously(monitor, percent) {
  if (!dxva2) return false
  const countBuf = Buffer.alloc(4)
  if (!GetNumberOfPhysicalMonitorsFromHMONITOR(monitor.hMon, countBuf)) return false
  const count = countBuf.readUInt32LE(0)
  if (!count) return false
  const buf = Buffer.alloc(PHYS_MON_SIZE * count)
  if (!GetPhysicalMonitorsFromHMONITOR(monitor.hMon, count, buf)) return false
  let accepted = false
  try {
    const rawValue = ddcRawValue(monitor, percent)
    for (let i = 0; i < count; i++) {
      if (SetMonitorBrightnessAPI(buf.readBigUInt64LE(i * PHYS_MON_SIZE), rawValue)) accepted = true
    }
  } finally {
    DestroyPhysicalMonitorsAPI(count, buf)
  }
  return accepted
}

function restoreMonitorBrightnessSynchronously(monitor, baseline) {
  if (monitor.type === 'internal') return brightnessWmi().writeBrightnessSynchronously(baseline, SHUTDOWN_INTERNAL_WRITE_TIMEOUT_MS)
  return !!monitor.hMon && writeDdcBrightnessSynchronously(monitor, clampBrightnessPercent(baseline))
}

function shutdownRestoreTarget(stableKey) {
  return monitors.find(m => m.stableKey === stableKey)
    ?? monitors.find(m => !m.stableKey && portMonitorKey(m.instancePath) === stableKey)
    ?? null
}

function restoreBatterySaverBrightnessOnShutdown() {
  if (!batterySaverBaselines.size()) return
  for (const [stableKey, baseline] of batterySaverBaselines.entries()) {
    const m = shutdownRestoreTarget(stableKey)
    if (!m) continue
    try {
      const accepted = restoreMonitorBrightnessSynchronously(m, baseline)
      if (!accepted) console.error('[brightness] shutdown restore was rejected by', m.name, `(${m.id})`)
      batterySaverBaselines.finishRestoreAttempt(stableKey, accepted)
    } catch (e) {
      console.error('[brightness] shutdown restore failed for', m.name, e?.message ?? e)
    }
  }
  persistBatterySaverBaselines()
}


module.exports = {
  applyBatterySaverDimming,
  clearBatterySaverDimming,
  restoreBatterySaverBrightnessOnShutdown,

  handlers: {
    'system/monitors-get': () => enumerate(),
    'system/monitor-brightness-set': (_event, { id, value }) =>
      setMonitorBrightness(id, value),

    'system/brightness-get': async () => {
      await ensureMonitorsEnumerated()
      return monitors[0]?.brightness ?? 50
    },
    'system/brightness-set': async (_event, value) => {
      await ensureMonitorsEnumerated()
      if (monitors.length > 0) return setMonitorBrightness(monitors[0].id, value)
      return value
    },
  },

  start(broadcast) {
    broadcastRef = broadcast
    loadPersistedBatterySaverBaselines()

    setImmediate(() => {
      ensureMonitorsEnumerated()
        .then(() => {
          publishMonitors()
          watchInternalBrightness()
          return settleBatterySaver()
        })
        .catch((e) => console.error('[brightness] initial sweep failed:', e?.message ?? e))
    })

    screen.on('display-added', resweepAfterDisplayChange)
    screen.on('display-removed', resweepAfterDisplayChange)

    setInterval(skippedWhileStillRunning('brightness', async () => {
      if (await refresh()) publishMonitors()
    }), 15000)

    setInterval(skippedWhileStillRunning('brightness', async () => {
      const state = await enumerate()
      if (JSON.stringify(state) !== lastStateJson) publishMonitors()
    }), 60000)
  },
}

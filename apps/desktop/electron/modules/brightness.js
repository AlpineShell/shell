const koffi = require('koffi')
const fs = require('fs')
const path = require('path')
const { exec, execSync } = require('child_process')
const { app, screen } = require('electron')
const { createPersistentRunner } = require('../powershell')
const { dimmedBrightness } = require('./batterySaverPolicy')

const wmiRunner = createPersistentRunner()


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

const BATTERY_SAVER_BASELINE_FILE = 'battery-saver-brightness.json'
const SHUTDOWN_INTERNAL_WRITE_TIMEOUT_MS = 2000
const DISPLAY_CHANGE_SETTLE_MS = 1500
const BRIGHTNESS_READBACK_TOLERANCE_PERCENT = 2


let monitors = []
let lastStateJson = null
let hasInternalDisplay = null
let brightnessWriteCount = 0
let broadcastRef = null
let enumeratePending = null
let baselineStorePath = null
let displayChangeTimer = null
let desiredBatterySaverReduction = null
let batterySaverSettleRunning = false
const brightnessWritesByMonitorId = new Map()
const batterySaverBaselineByMonitorId = new Map()
const batterySaverAppliedByMonitorId = new Map()


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


function isInternalVideoOutput(values) {
  return values.some(v => v === 16 || v === 2147483648 || v === 6 || v === 11 || v === 13)
}

const INTERNAL_PROBE_CMD =
  'powershell -NoProfile -Command "' +
  "$ErrorActionPreference='SilentlyContinue';$v='';$b='';" +
  "try{$v=((Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorConnectionParams).VideoOutputTechnology -join ',')}catch{};" +
  "try{$b=(@((Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness).CurrentBrightness)[0])}catch{};" +
  "($v + '#' + $b)" +
  '"'

function probeInternalAndBrightness() {
  return new Promise((resolve) => {
    exec(INTERNAL_PROBE_CMD, (err, stdout) => {
      if (err) return resolve({ hasInternal: false, brightness: null })
      const line = (stdout || '').trim()
      const sep = line.indexOf('#')
      const votPart = sep >= 0 ? line.slice(0, sep) : line
      const brPart = sep >= 0 ? line.slice(sep + 1) : ''
      const values = votPart.split(',').map(v => parseInt(v.trim(), 10)).filter(v => !isNaN(v))
      const brightness = parseInt(brPart.trim(), 10)
      resolve({ hasInternal: isInternalVideoOutput(values), brightness: isNaN(brightness) ? null : brightness })
    })
  })
}


const MONITOR_DEFAULTTONEAREST = 0x02

function enumLogicalMonitors() {
  const displays = screen.getAllDisplays()
  const results = []
  const seen = new Set()
  for (const d of displays) {
    const rect = Buffer.alloc(16)
    rect.writeInt32LE(d.bounds.x, 0)
    rect.writeInt32LE(d.bounds.y, 4)
    rect.writeInt32LE(d.bounds.x + d.bounds.width, 8)
    rect.writeInt32LE(d.bounds.y + d.bounds.height, 12)
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

const DDC_CALL_TIMEOUT_MS = 4000

function offMainThread(api, args) {
  return new Promise((resolve) => {
    let timeout = null
    let settled = false
    const settle = (value) => {
      if (settled) return
      settled = true
      if (timeout) clearTimeout(timeout)
      resolve(value)
    }
    timeout = setTimeout(() => {
      console.error(`[brightness] DDC/CI call did not answer within ${DDC_CALL_TIMEOUT_MS} ms`)
      settle(0)
    }, DDC_CALL_TIMEOUT_MS)
    try {
      api.async(...args, (err, result) => settle(err ? 0 : result))
    } catch (_) {
      settle(0)
    }
  })
}

async function getPhysicalMonitors(hMon) {
  if (!dxva2) return []
  const countBuf = Buffer.alloc(4)
  if (!await offMainThread(GetNumberOfPhysicalMonitorsFromHMONITOR, [hMon, countBuf])) return []
  const count = countBuf.readUInt32LE(0)
  if (!count) return []

  const buf = Buffer.alloc(PHYS_MON_SIZE * count)
  if (!await offMainThread(GetPhysicalMonitorsFromHMONITOR, [hMon, count, buf])) return []

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
  if (!await offMainThread(GetMonitorBrightnessAPI, [hPhysical, min, cur, max])) return null
  return {
    current: cur.readUInt32LE(0),
    max: max.readUInt32LE(0),
  }
}

async function ddcSetBrightness(hPhysical, rawValue) {
  return !!await offMainThread(SetMonitorBrightnessAPI, [hPhysical, rawValue])
}

function ddcRawValue(monitor, percent) {
  return Math.round((percent / 100) * (monitor.ddcMax || 100))
}


async function wmiGetBrightness() {
  const result = await wmiRunner.run('(Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness).CurrentBrightness')
  const val = parseInt(result.trim(), 10)
  return isNaN(val) ? null : val
}

function wmiSetBrightnessCommand(clamped) {
  return `powershell -NoProfile -Command "(Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods).WmiSetBrightness(1, ${clamped})"`
}

function wmiSetBrightness(value) {
  const clamped = clampPercent(value)
  return new Promise((resolve) => {
    exec(wmiSetBrightnessCommand(clamped), () => resolve(clamped))
  })
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, Math.round(value)))
}


function recordBrightnessWrite(id, brightness) {
  brightnessWriteCount++
  brightnessWritesByMonitorId.set(id, { brightness, writeCount: brightnessWriteCount })
  const live = monitors.find(m => m.id === id)
  if (live) live.brightness = brightness
}

function adoptBrightnessWritesSince(newMonitors, writeCount) {
  for (const m of newMonitors) {
    const write = brightnessWritesByMonitorId.get(m.id)
    if (write && write.writeCount > writeCount) m.brightness = write.brightness
  }
}

function forgetBrightnessWritesForAbsentMonitors() {
  for (const id of brightnessWritesByMonitorId.keys()) {
    if (!monitors.some(m => m.id === id)) brightnessWritesByMonitorId.delete(id)
  }
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
              newMonitors.push({
                id: deviceName || `ddc-${newMonitors.length}`,
                name: cleanName(phys.name, deviceName, newMonitors.length),
                type: 'external',
                brightness,
                hMon,
                ddcMax: b.max || 100,
              })
            }
          } catch (_) {}
        }
      })
    }
  }

  let internalBrightness
  if (hasInternalDisplay === null) {
    const probe = await probeInternalAndBrightness()
    hasInternalDisplay = probe.hasInternal
    internalBrightness = probe.brightness
  } else if (hasInternalDisplay) {
    internalBrightness = await wmiGetBrightness()
  }

  if (hasInternalDisplay && internalBrightness != null) {
    newMonitors.push({
      id: 'internal',
      name: 'Built-in Display',
      type: 'internal',
      brightness: internalBrightness,
      hMon: null,
      ddcMax: null,
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
            noteObservedBrightness(m.id, val)
          }
        } catch (_) {}
      }
    })
  }

  const internal = sweptMonitors.find(m => m.type === 'internal')
  if (internal) {
    const val = await wmiGetBrightness()
    if (val !== null) {
      if (val !== internal.brightness) {
        internal.brightness = val
        changed = true
      }
      noteObservedBrightness(internal.id, val)
    }
  }

  return changed && monitors === sweptMonitors
}


async function writeMonitorBrightness(id, value) {
  const clamped = clampPercent(value)
  const m = monitors.find(x => x.id === id)
  if (!m) return clamped

  if (m.type === 'internal') {
    await wmiSetBrightness(clamped)
  } else if (m.hMon) {
    const rawValue = ddcRawValue(m, clamped)
    await withPhysicalMonitor(m.hMon, async (physMonitors) => {
      for (const phys of physMonitors) await ddcSetBrightness(phys.handle, rawValue)
    })
  }

  recordBrightnessWrite(id, clamped)
  return clamped
}

async function setMonitorBrightness(id, value) {
  const clamped = await writeMonitorBrightness(id, value)
  forgetBatterySaverBaseline(id)
  return clamped
}

function skippedWhileStillRunning(task) {
  let running = false
  return async () => {
    if (running) return
    running = true
    try {
      await task()
    } catch (e) {
      console.error('[brightness] periodic sweep failed:', e?.message ?? e)
    } finally {
      running = false
    }
  }
}

function publicState() {
  return monitors.map(m => ({
    id: m.id,
    name: m.name,
    type: m.type,
    brightness: m.brightness,
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
    if (!batterySaverBaselineByMonitorId.size) {
      fs.rmSync(file, { force: true })
      return
    }
    fs.writeFileSync(file, JSON.stringify(Object.fromEntries(batterySaverBaselineByMonitorId)))
  } catch (e) {
    console.error('[brightness] could not persist the battery saver baseline:', e?.message ?? e)
  }
}

function loadPersistedBatterySaverBaselines() {
  try {
    const file = getBaselineStorePath()
    if (!fs.existsSync(file)) return
    const stored = JSON.parse(fs.readFileSync(file, 'utf8'))
    for (const [id, value] of Object.entries(stored ?? {})) {
      if (typeof value === 'number') batterySaverBaselineByMonitorId.set(id, clampPercent(value))
    }
  } catch (e) {
    console.error('[brightness] could not read the battery saver baseline:', e?.message ?? e)
  }
}

function forgetBatterySaverBaseline(id) {
  if (!batterySaverBaselineByMonitorId.delete(id)) return
  batterySaverAppliedByMonitorId.delete(id)
  persistBatterySaverBaselines()
}

function withinReadbackTolerance(expected, observed) {
  return typeof expected === 'number' && Math.abs(expected - observed) <= BRIGHTNESS_READBACK_TOLERANCE_PERCENT
}

function noteObservedBrightness(id, observed) {
  if (!batterySaverBaselineByMonitorId.has(id)) return
  if (withinReadbackTolerance(batterySaverAppliedByMonitorId.get(id), observed)) return
  if (withinReadbackTolerance(batterySaverBaselineByMonitorId.get(id), observed)) return
  forgetBatterySaverBaseline(id)
}

async function dimForBatterySaver(reductionPercent) {
  let changed = false
  for (const id of monitors.map(m => m.id)) {
    const live = monitors.find(m => m.id === id)
    if (!live) continue
    if (!batterySaverBaselineByMonitorId.has(id)) batterySaverBaselineByMonitorId.set(id, live.brightness)
    const target = dimmedBrightness(batterySaverBaselineByMonitorId.get(id), reductionPercent)
    if (batterySaverAppliedByMonitorId.get(id) === target) continue
    await writeMonitorBrightness(id, target)
    batterySaverAppliedByMonitorId.set(id, target)
    changed = true
  }
  if (changed) {
    persistBatterySaverBaselines()
    publishMonitors()
  }
}

async function restoreFromBatterySaver() {
  let changed = false
  for (const id of [...batterySaverBaselineByMonitorId.keys()]) {
    if (!monitors.some(m => m.id === id)) continue
    await writeMonitorBrightness(id, batterySaverBaselineByMonitorId.get(id))
    batterySaverBaselineByMonitorId.delete(id)
    batterySaverAppliedByMonitorId.delete(id)
    changed = true
  }
  if (changed) {
    persistBatterySaverBaselines()
    publishMonitors()
  }
}

async function settleBatterySaver() {
  if (batterySaverSettleRunning) return
  batterySaverSettleRunning = true
  try {
    let settledReduction
    while (settledReduction !== desiredBatterySaverReduction) {
      settledReduction = desiredBatterySaverReduction
      await ensureMonitorsEnumerated()
      if (settledReduction === null) await restoreFromBatterySaver()
      else await dimForBatterySaver(settledReduction)
    }
  } catch (e) {
    console.error('[brightness] battery saver dimming failed:', e?.message ?? e)
  } finally {
    batterySaverSettleRunning = false
  }
}

function applyBatterySaverDimming(reductionPercent) {
  desiredBatterySaverReduction = reductionPercent
  return settleBatterySaver()
}

function clearBatterySaverDimming() {
  desiredBatterySaverReduction = null
  return settleBatterySaver()
}

function resweepAfterDisplayChange() {
  clearTimeout(displayChangeTimer)
  displayChangeTimer = setTimeout(() => {
    enumerate()
      .then(() => {
        publishMonitors()
        return settleBatterySaver()
      })
      .catch((e) => console.error('[brightness] display change sweep failed:', e?.message ?? e))
  }, DISPLAY_CHANGE_SETTLE_MS)
}


function writeDdcBrightnessSynchronously(monitor, percent) {
  if (!dxva2) return
  const countBuf = Buffer.alloc(4)
  if (!GetNumberOfPhysicalMonitorsFromHMONITOR(monitor.hMon, countBuf)) return
  const count = countBuf.readUInt32LE(0)
  if (!count) return
  const buf = Buffer.alloc(PHYS_MON_SIZE * count)
  if (!GetPhysicalMonitorsFromHMONITOR(monitor.hMon, count, buf)) return
  try {
    const rawValue = ddcRawValue(monitor, percent)
    for (let i = 0; i < count; i++) {
      SetMonitorBrightnessAPI(buf.readBigUInt64LE(i * PHYS_MON_SIZE), rawValue)
    }
  } finally {
    DestroyPhysicalMonitorsAPI(count, buf)
  }
}

function writeInternalBrightnessSynchronously(percent) {
  execSync(wmiSetBrightnessCommand(clampPercent(percent)), {
    timeout: SHUTDOWN_INTERNAL_WRITE_TIMEOUT_MS,
    stdio: 'ignore',
    windowsHide: true,
  })
}

function restoreBatterySaverBrightnessOnShutdown() {
  if (!batterySaverBaselineByMonitorId.size) return
  for (const [id, baseline] of [...batterySaverBaselineByMonitorId.entries()]) {
    const m = monitors.find(x => x.id === id)
    if (!m) continue
    try {
      if (m.type === 'internal') writeInternalBrightnessSynchronously(baseline)
      else if (m.hMon) writeDdcBrightnessSynchronously(m, clampPercent(baseline))
      batterySaverBaselineByMonitorId.delete(id)
      batterySaverAppliedByMonitorId.delete(id)
    } catch (e) {
      console.error('[brightness] shutdown restore failed for', id, e?.message ?? e)
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
          return settleBatterySaver()
        })
        .catch((e) => console.error('[brightness] initial sweep failed:', e?.message ?? e))
    })

    screen.on('display-added', resweepAfterDisplayChange)
    screen.on('display-removed', resweepAfterDisplayChange)

    setInterval(skippedWhileStillRunning(async () => {
      if (await refresh()) publishMonitors()
    }), 15000)

    setInterval(skippedWhileStillRunning(async () => {
      const state = await enumerate()
      if (JSON.stringify(state) !== lastStateJson) publishMonitors()
    }), 60000)
  },
}

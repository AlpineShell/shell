const koffi = require('koffi')
const { exec } = require('child_process')

// -- Win32 API setup --
const user32 = koffi.load('user32.dll')

let dxva2
try { dxva2 = koffi.load('dxva2.dll') } catch (_) { dxva2 = null }

// Callback prototype for EnumDisplayMonitors
const MonitorEnumProc = koffi.proto(
  '__stdcall', 'MonitorEnumProc', 'int',
  ['uintptr_t', 'uintptr_t', 'void *', 'intptr_t']
)

const EnumDisplayMonitors = user32.func(
  '__stdcall', 'EnumDisplayMonitors', 'int',
  ['uintptr_t', 'void *', 'MonitorEnumProc *', 'intptr_t']
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

// PHYSICAL_MONITOR struct: HANDLE (8 bytes) + WCHAR[128] (256 bytes) = 264 bytes
const HANDLE_SIZE = 8
const PHYS_MON_SIZE = HANDLE_SIZE + 128 * 2
// MONITORINFOEXW: cbSize(4) + rcMonitor(16) + rcWork(16) + dwFlags(4) + szDevice(64) = 104
const MONINFO_SIZE = 104

// -- State --
let monitors = []    // internal cache with handles
let lastStateJson = null

// -- Helpers --
function readWideString(buf, offset, maxChars) {
  for (let i = 0; i < maxChars; i++) {
    if (buf.readUInt16LE(offset + i * 2) === 0)
      return buf.slice(offset, offset + i * 2).toString('utf16le')
  }
  return buf.slice(offset, offset + maxChars * 2).toString('utf16le')
}

function toNum(h) {
  return typeof h === 'bigint' ? Number(h) : h
}

function cleanName(physName, deviceName, index) {
  if (physName && physName !== 'Generic PnP Monitor' && physName !== 'Generic Monitor')
    return physName
  const m = deviceName?.match(/DISPLAY(\d+)/i)
  if (m) return `Display ${m[1]}`
  return `Display ${index + 1}`
}

// -- Monitor enumeration via Win32 --
function enumLogicalMonitors() {
  const handles = []
  const cb = koffi.register((hMon) => {
    handles.push(toNum(hMon))
    return 1
  }, MonitorEnumProc)
  EnumDisplayMonitors(0, null, cb, 0)
  koffi.unregister(cb)
  return handles
}

function getDeviceName(hMon) {
  const buf = Buffer.alloc(MONINFO_SIZE)
  buf.writeUInt32LE(MONINFO_SIZE, 0)
  if (!GetMonitorInfoW(hMon, buf)) return null
  return readWideString(buf, 40, 32)
}

function getPhysicalMonitors(hMon) {
  if (!dxva2) return []
  const countBuf = Buffer.alloc(4)
  if (!GetNumberOfPhysicalMonitorsFromHMONITOR(hMon, countBuf)) return []
  const count = countBuf.readUInt32LE(0)
  if (!count) return []

  const buf = Buffer.alloc(PHYS_MON_SIZE * count)
  if (!GetPhysicalMonitorsFromHMONITOR(hMon, count, buf)) return []

  const result = []
  for (let i = 0; i < count; i++) {
    const off = i * PHYS_MON_SIZE
    result.push({
      handle: Number(buf.readBigUInt64LE(off)),
      name: readWideString(buf, off + HANDLE_SIZE, 128),
    })
  }
  return result
}

function destroyPhysicalHandle(handle) {
  if (!dxva2 || !handle) return
  const buf = Buffer.alloc(PHYS_MON_SIZE)
  buf.writeBigUInt64LE(BigInt(handle), 0)
  try { DestroyPhysicalMonitorsAPI(1, buf) } catch (_) {}
}

function destroyAllHandles() {
  for (const m of monitors) {
    if (m.hPhysical) destroyPhysicalHandle(m.hPhysical)
  }
}

// -- DDC/CI brightness (external monitors) --
function ddcGetBrightness(hPhysical) {
  const min = Buffer.alloc(4), cur = Buffer.alloc(4), max = Buffer.alloc(4)
  if (!GetMonitorBrightnessAPI(hPhysical, min, cur, max)) return null
  return {
    min: min.readUInt32LE(0),
    current: cur.readUInt32LE(0),
    max: max.readUInt32LE(0),
  }
}

function ddcSetBrightness(hPhysical, rawValue) {
  return !!SetMonitorBrightnessAPI(hPhysical, rawValue)
}

// -- WMI brightness (built-in laptop display) --
function wmiGetBrightness() {
  return new Promise((resolve) => {
    exec(
      'powershell -NoProfile -Command "(Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness).CurrentBrightness"',
      (err, stdout) => {
        if (err) return resolve(null)
        const val = parseInt(stdout.trim(), 10)
        resolve(isNaN(val) ? null : val)
      }
    )
  })
}

function wmiSetBrightness(value) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)))
  return new Promise((resolve) => {
    exec(
      `powershell -NoProfile -Command "(Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods).WmiSetBrightness(1, ${clamped})"`,
      () => resolve(clamped)
    )
  })
}

// -- Core: full enumeration --
async function enumerate() {
  destroyAllHandles()
  const newMonitors = []

  if (dxva2) {
    for (const hMon of enumLogicalMonitors()) {
      const deviceName = getDeviceName(hMon)
      for (const phys of getPhysicalMonitors(hMon)) {
        try {
          const b = ddcGetBrightness(phys.handle)
          if (b) {
            const brightness = b.max > 0
              ? Math.round((b.current / b.max) * 100)
              : b.current
            newMonitors.push({
              id: deviceName || `ddc-${newMonitors.length}`,
              name: cleanName(phys.name, deviceName, newMonitors.length),
              type: 'external',
              brightness,
              hPhysical: phys.handle,
              ddcMax: b.max || 100,
            })
          } else {
            destroyPhysicalHandle(phys.handle)
          }
        } catch (_) {
          destroyPhysicalHandle(phys.handle)
        }
      }
    }
  }

  const wmiBrightness = await wmiGetBrightness()
  if (wmiBrightness !== null) {
    newMonitors.push({
      id: 'internal',
      name: 'Built-in Display',
      type: 'internal',
      brightness: wmiBrightness,
      hPhysical: null,
      ddcMax: null,
    })
  }

  monitors = newMonitors
  return publicState()
}

// -- Core: quick refresh (no re-enumeration, reuse cached handles) --
async function refresh() {
  let changed = false

  for (const m of monitors) {
    if (m.type === 'external' && m.hPhysical) {
      try {
        const b = ddcGetBrightness(m.hPhysical)
        if (b) {
          const val = b.max > 0
            ? Math.round((b.current / b.max) * 100)
            : b.current
          if (val !== m.brightness) { m.brightness = val; changed = true }
        }
      } catch (_) {}
    }
  }

  const internal = monitors.find(m => m.type === 'internal')
  if (internal) {
    const val = await wmiGetBrightness()
    if (val !== null && val !== internal.brightness) {
      internal.brightness = val
      changed = true
    }
  }

  return changed
}

// -- Set brightness for a specific monitor --
async function setMonitorBrightness(id, value) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)))
  const m = monitors.find(x => x.id === id)
  if (!m) return clamped

  if (m.type === 'internal') {
    await wmiSetBrightness(clamped)
  } else if (m.hPhysical) {
    const rawValue = Math.round((clamped / 100) * (m.ddcMax || 100))
    ddcSetBrightness(m.hPhysical, rawValue)
  }

  m.brightness = clamped
  return clamped
}

function publicState() {
  return monitors.map(m => ({
    id: m.id,
    name: m.name,
    type: m.type,
    brightness: m.brightness,
  }))
}

// -- Module export --
module.exports = {
  handlers: {
    'system/monitors-get': () => enumerate(),
    'system/monitor-brightness-set': (_event, { id, value }) =>
      setMonitorBrightness(id, value),

    // Legacy single-monitor API (backward compat)
    'system/brightness-get': async () => {
      if (!monitors.length) await enumerate()
      return monitors[0]?.brightness ?? 50
    },
    'system/brightness-set': async (_event, value) => {
      if (!monitors.length) await enumerate()
      if (monitors.length > 0) return setMonitorBrightness(monitors[0].id, value)
      return value
    },
  },

  start(broadcast) {
    // Initial enumeration
    enumerate().then(state => {
      lastStateJson = JSON.stringify(state)
      broadcast('system/monitors-changed', state)
    })

    // Quick brightness refresh every 5 seconds (reuses cached handles)
    setInterval(async () => {
      if (await refresh()) {
        const state = publicState()
        lastStateJson = JSON.stringify(state)
        broadcast('system/monitors-changed', state)
      }
    }, 5000)

    // Full re-enumeration every 60 seconds (detects new/removed monitors)
    setInterval(() => {
      enumerate().then(state => {
        const json = JSON.stringify(state)
        if (json !== lastStateJson) {
          lastStateJson = json
          broadcast('system/monitors-changed', state)
        }
      })
    }, 60000)
  },
}

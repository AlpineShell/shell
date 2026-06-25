const koffi = require('koffi')
const { exec, spawn } = require('child_process')
const { screen } = require('electron')


const WMI_DELIM = '__BRIGHTNESS_DONE__'

let wmiPs = null
let wmiPsReady = null
let wmiPendingResolve = null
let wmiOutputBuf = ''
let wmiCommandQueue = []
let wmiBusy = false

function initWmiPs() {
  if (wmiPsReady) return wmiPsReady
  wmiPsReady = new Promise((resolveInit) => {
    wmiPs = spawn('powershell', [
      '-NoProfile', '-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', '-'
    ], { stdio: ['pipe', 'pipe', 'ignore'] })

    wmiPs.stdout.on('data', (chunk) => {
      wmiOutputBuf += chunk.toString()
      const idx = wmiOutputBuf.indexOf(WMI_DELIM)
      if (idx !== -1) {
        const result = wmiOutputBuf.substring(0, idx).trim()
        wmiOutputBuf = wmiOutputBuf.substring(idx + WMI_DELIM.length).replace(/^\r?\n/, '')
        if (wmiPendingResolve) {
          const r = wmiPendingResolve
          wmiPendingResolve = null
          r(result)
        }
      }
    })

    wmiPs.on('exit', () => {
      wmiPs = null
      wmiPsReady = null
      wmiBusy = false
      if (wmiPendingResolve) { wmiPendingResolve(''); wmiPendingResolve = null }
      for (const { resolve } of wmiCommandQueue) resolve('')
      wmiCommandQueue = []
    })

    wmiPs.stdin.on('error', () => {})

    wmiPendingResolve = () => { resolveInit(); processNextWmi() }
    wmiPs.stdin.write(`[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\nWrite-Output '${WMI_DELIM}'\n`)
  })
  return wmiPsReady
}

function processNextWmi() {
  if (!wmiPs || wmiCommandQueue.length === 0) { wmiBusy = false; return }
  wmiBusy = true
  const { cmd, resolve } = wmiCommandQueue.shift()
  wmiPendingResolve = (result) => {
    resolve(result)
    processNextWmi()
  }
  wmiPs.stdin.write(`${cmd}\nWrite-Output '${WMI_DELIM}'\n`)
}

async function runWmiCmd(cmd) {
  await initWmiPs()
  return new Promise((resolve) => {
    wmiCommandQueue.push({ cmd, resolve })
    if (!wmiBusy) processNextWmi()
  })
}


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


let monitors = []
let lastStateJson = null
let hasInternalDisplay = null


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
    const h = toNum(MonitorFromRect(rect, MONITOR_DEFAULTTONEAREST))
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


function withPhysicalMonitor(hMon, fn) {
  const physMonitors = getPhysicalMonitors(hMon)
  try {
    return fn(physMonitors)
  } finally {
    for (const p of physMonitors) destroyPhysicalHandle(p.handle)
  }
}

function ddcGetBrightness(hPhysical) {
  const min = Buffer.alloc(4), cur = Buffer.alloc(4), max = Buffer.alloc(4)
  if (!GetMonitorBrightnessAPI(hPhysical, min, cur, max)) return null
  return {
    current: cur.readUInt32LE(0),
    max: max.readUInt32LE(0),
  }
}

function ddcSetBrightness(hPhysical, rawValue) {
  return !!SetMonitorBrightnessAPI(hPhysical, rawValue)
}


async function wmiGetBrightness() {
  const result = await runWmiCmd('(Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness).CurrentBrightness')
  const val = parseInt(result.trim(), 10)
  return isNaN(val) ? null : val
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


async function enumerate() {
  const newMonitors = []

  if (dxva2) {
    for (const hMon of enumLogicalMonitors()) {
      const deviceName = getDeviceName(hMon)
      withPhysicalMonitor(hMon, (physMonitors) => {
        for (const phys of physMonitors) {
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

  monitors = newMonitors
  return publicState()
}


async function refresh() {
  let changed = false

  for (const m of monitors) {
    if (m.type === 'external' && m.hMon) {
      withPhysicalMonitor(m.hMon, (physMonitors) => {
        for (const phys of physMonitors) {
          try {
            const b = ddcGetBrightness(phys.handle)
            if (b) {
              const val = b.max > 0
                ? Math.round((b.current / b.max) * 100)
                : b.current
              if (val !== m.brightness) { m.brightness = val; changed = true }
            }
          } catch (_) {}
        }
      })
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


async function setMonitorBrightness(id, value) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)))
  const m = monitors.find(x => x.id === id)
  if (!m) return clamped

  if (m.type === 'internal') {
    await wmiSetBrightness(clamped)
  } else if (m.hMon) {
    const rawValue = Math.round((clamped / 100) * (m.ddcMax || 100))
    withPhysicalMonitor(m.hMon, (physMonitors) => {
      for (const phys of physMonitors) ddcSetBrightness(phys.handle, rawValue)
    })
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


module.exports = {
  handlers: {
    'system/monitors-get': () => enumerate(),
    'system/monitor-brightness-set': (_event, { id, value }) =>
      setMonitorBrightness(id, value),

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
    setImmediate(() => {
      enumerate().then(state => {
        lastStateJson = JSON.stringify(state)
        broadcast('system/monitors-changed', state)
      })
    })

    setInterval(async () => {
      if (await refresh()) {
        const state = publicState()
        lastStateJson = JSON.stringify(state)
        broadcast('system/monitors-changed', state)
      }
    }, 15000)

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

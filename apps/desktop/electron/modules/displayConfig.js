const { app, screen } = require('electron')
const koffi = require('koffi')

const user32 = koffi.load('user32.dll')

const EnumDisplayDevicesW = user32.func('__stdcall', 'EnumDisplayDevicesW', 'int', ['str16', 'uint32', 'void *', 'uint32'])
const EnumDisplaySettingsExW = user32.func('__stdcall', 'EnumDisplaySettingsExW', 'int', ['str16', 'uint32', 'void *', 'uint32'])
const ChangeDisplaySettingsExW = user32.func('__stdcall', 'ChangeDisplaySettingsExW', 'long', ['str16', 'void *', 'uintptr_t', 'uint32', 'void *'])

const DISPLAY_DEVICE_SIZE = 840
const DD_DEVICENAME_OFFSET = 4
const DD_DEVICESTRING_OFFSET = 68
const DD_STATEFLAGS_OFFSET = 324

const DEVMODE_SIZE = 220
const DM_SIZE_OFFSET = 68
const DM_FIELDS_OFFSET = 72
const DM_POSITION_X_OFFSET = 76
const DM_POSITION_Y_OFFSET = 80
const DM_ORIENTATION_OFFSET = 84
const DM_PELSWIDTH_OFFSET = 172
const DM_PELSHEIGHT_OFFSET = 176
const DM_FREQUENCY_OFFSET = 184

const DISPLAY_DEVICE_ATTACHED_TO_DESKTOP = 0x1
const DISPLAY_DEVICE_PRIMARY_DEVICE = 0x4

const ENUM_CURRENT_SETTINGS = 0xffffffff

const DM_POSITION = 0x00000020
const DM_DISPLAYORIENTATION = 0x00000080
const DM_PELSWIDTH = 0x00080000
const DM_PELSHEIGHT = 0x00100000

const CDS_UPDATEREGISTRY = 0x00000001
const CDS_GLOBAL = 0x00000008
const CDS_SET_PRIMARY = 0x00000010
const CDS_NORESET = 0x10000000

const DISP_CHANGE_SUCCESSFUL = 0

const AUTO_REVERT_MS = 20000
const HOTPLUG_DEBOUNCE_MS = 400

let broadcastRef = null
let rollbackSnapshot = null
let revertTimer = null
let hotplugTimer = null

function toNum(value) {
  return typeof value === 'bigint' ? Number(value) : value
}

function readWideString(buf, byteOffset, maxChars) {
  let result = ''
  for (let i = 0; i < maxChars; i++) {
    const code = buf.readUInt16LE(byteOffset + i * 2)
    if (code === 0) break
    result += String.fromCharCode(code)
  }
  return result
}

function orientationFromDmdo(value) {
  return [0, 90, 180, 270][value] ?? 0
}

function dmdoFromOrientation(value) {
  return { 0: 0, 90: 1, 180: 2, 270: 3 }[value] ?? 0
}

function normalizeOrientation(value) {
  const allowed = [0, 90, 180, 270]
  return allowed.includes(value) ? value : 0
}

function labelForDevice(deviceName) {
  const match = /DISPLAY(\d+)/i.exec(deviceName)
  return match ? `Display ${match[1]}` : 'Display'
}

function monitorNameForAdapter(deviceName) {
  const monitor = Buffer.alloc(DISPLAY_DEVICE_SIZE)
  monitor.writeUInt32LE(DISPLAY_DEVICE_SIZE, 0)
  if (!EnumDisplayDevicesW(deviceName, 0, monitor, 0)) return ''
  return readWideString(monitor, DD_DEVICESTRING_OFFSET, 128)
}

function readCurrentMode(deviceName) {
  const mode = Buffer.alloc(DEVMODE_SIZE)
  mode.writeUInt16LE(DEVMODE_SIZE, DM_SIZE_OFFSET)
  if (!EnumDisplaySettingsExW(deviceName, ENUM_CURRENT_SETTINGS, mode, 0)) return null
  return mode
}

function enumerateDisplays() {
  const displays = []
  let index = 0
  while (true) {
    const adapter = Buffer.alloc(DISPLAY_DEVICE_SIZE)
    adapter.writeUInt32LE(DISPLAY_DEVICE_SIZE, 0)
    if (!EnumDisplayDevicesW(null, index, adapter, 0)) break
    index++

    const stateFlags = adapter.readUInt32LE(DD_STATEFLAGS_OFFSET)
    if (!(stateFlags & DISPLAY_DEVICE_ATTACHED_TO_DESKTOP)) continue

    const deviceName = readWideString(adapter, DD_DEVICENAME_OFFSET, 32)
    const mode = readCurrentMode(deviceName)
    if (!mode) continue

    displays.push({
      id: deviceName,
      name: monitorNameForAdapter(deviceName) || labelForDevice(deviceName),
      x: mode.readInt32LE(DM_POSITION_X_OFFSET),
      y: mode.readInt32LE(DM_POSITION_Y_OFFSET),
      width: mode.readUInt32LE(DM_PELSWIDTH_OFFSET),
      height: mode.readUInt32LE(DM_PELSHEIGHT_OFFSET),
      orientation: orientationFromDmdo(mode.readUInt32LE(DM_ORIENTATION_OFFSET)),
      refreshRate: mode.readUInt32LE(DM_FREQUENCY_OFFSET),
      primary: !!(stateFlags & DISPLAY_DEVICE_PRIMARY_DEVICE),
    })
  }
  return displays
}

function isPortrait(orientation) {
  return orientation === 90 || orientation === 270
}

function stageDisplay(entry, offsetX, offsetY, makePrimary) {
  const mode = readCurrentMode(entry.id)
  if (!mode) return null

  const currentOrientation = orientationFromDmdo(mode.readUInt32LE(DM_ORIENTATION_OFFSET))
  const targetOrientation = normalizeOrientation(entry.orientation)
  if (isPortrait(currentOrientation) !== isPortrait(targetOrientation)) {
    const width = mode.readUInt32LE(DM_PELSWIDTH_OFFSET)
    const height = mode.readUInt32LE(DM_PELSHEIGHT_OFFSET)
    mode.writeUInt32LE(height, DM_PELSWIDTH_OFFSET)
    mode.writeUInt32LE(width, DM_PELSHEIGHT_OFFSET)
  }

  mode.writeUInt32LE(dmdoFromOrientation(targetOrientation), DM_ORIENTATION_OFFSET)
  mode.writeInt32LE(Math.round(entry.x - offsetX), DM_POSITION_X_OFFSET)
  mode.writeInt32LE(Math.round(entry.y - offsetY), DM_POSITION_Y_OFFSET)

  const fields = mode.readUInt32LE(DM_FIELDS_OFFSET) | DM_POSITION | DM_DISPLAYORIENTATION | DM_PELSWIDTH | DM_PELSHEIGHT
  mode.writeUInt32LE(fields, DM_FIELDS_OFFSET)

  let flags = CDS_UPDATEREGISTRY | CDS_NORESET | CDS_GLOBAL
  if (makePrimary) flags |= CDS_SET_PRIMARY
  return toNum(ChangeDisplaySettingsExW(entry.id, mode, 0, flags, null))
}

function applyLayout(layout) {
  if (!Array.isArray(layout) || layout.length === 0) return { ok: false, code: null }

  const primaryEntry = layout.find((entry) => entry.primary) || layout[0]
  const offsetX = primaryEntry.x
  const offsetY = primaryEntry.y

  let staged = 0
  for (const entry of layout) {
    const result = stageDisplay(entry, offsetX, offsetY, entry.id === primaryEntry.id)
    if (result === null) continue
    if (result !== DISP_CHANGE_SUCCESSFUL) return { ok: false, code: result, device: entry.id }
    staged++
  }
  if (staged === 0) return { ok: false, code: null }

  const commit = toNum(ChangeDisplaySettingsExW(null, null, 0, 0, null))
  return { ok: commit === DISP_CHANGE_SUCCESSFUL, code: commit }
}

function toLayout(displays) {
  return displays.map((display) => ({
    id: display.id,
    x: display.x,
    y: display.y,
    orientation: display.orientation,
    primary: display.primary,
  }))
}

function clearRevertTimer() {
  if (revertTimer) {
    clearTimeout(revertTimer)
    revertTimer = null
  }
}

function broadcastDisplays() {
  if (broadcastRef) broadcastRef('system/displays-changed', enumerateDisplays())
}

function rollback() {
  clearRevertTimer()
  if (!rollbackSnapshot) return
  applyLayout(toLayout(rollbackSnapshot))
  rollbackSnapshot = null
}

function scheduleHotplugBroadcast() {
  if (hotplugTimer) clearTimeout(hotplugTimer)
  hotplugTimer = setTimeout(() => {
    hotplugTimer = null
    broadcastDisplays()
  }, HOTPLUG_DEBOUNCE_MS)
}

module.exports = {
  handlers: {
    'system/displays-get': () => enumerateDisplays(),
    'system/displays-apply': (_event, layout) => {
      const before = enumerateDisplays()
      const result = applyLayout(layout)
      if (result.ok) {
        clearRevertTimer()
        rollbackSnapshot = before
        revertTimer = setTimeout(() => {
          revertTimer = null
          rollback()
          broadcastDisplays()
        }, AUTO_REVERT_MS)
        broadcastDisplays()
      }
      return { ...result, displays: enumerateDisplays() }
    },
    'system/displays-keep': () => {
      clearRevertTimer()
      rollbackSnapshot = null
      return { ok: true }
    },
    'system/displays-revert': () => {
      rollback()
      const displays = enumerateDisplays()
      broadcastDisplays()
      return displays
    },
  },
  start(broadcast) {
    broadcastRef = broadcast
    screen.on('display-added', scheduleHotplugBroadcast)
    screen.on('display-removed', scheduleHotplugBroadcast)
    screen.on('display-metrics-changed', scheduleHotplugBroadcast)
    app.on('will-quit', () => {
      clearRevertTimer()
      if (hotplugTimer) clearTimeout(hotplugTimer)
    })
  },
}

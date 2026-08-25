import { describe, it, expect } from 'vitest'
import monitorIdentity from './monitorIdentity.js'

const {
  BUILTIN_MONITOR_KEY,
  LEGACY_BUILTIN_MONITOR_ID,
  EDID_KEY_PREFIX,
  PORT_KEY_PREFIX,
  normalizeInstancePath,
  edidMonitorKey,
  portMonitorKey,
  assignStableMonitorKeys,
  isPersistableMonitorKey,
  migratePersistedBaselines,
  parseMonitorEdidRows,
} = monitorIdentity

const LEFT_DELL_INTERFACE = '\\\\?\\DISPLAY#DEL4278#5&391b0070&0&UID278#{e6f07b5f-ee97-4a90-b076-33f57bf4eaa7}'
const RIGHT_DELL_INTERFACE = '\\\\?\\DISPLAY#DEL4278#5&391b0070&0&UID257#{e6f07b5f-ee97-4a90-b076-33f57bf4eaa7}'
const LEFT_DELL_WMI_INSTANCE = 'DISPLAY\\DEL4278\\5&391b0070&0&UID278_0'
const RIGHT_DELL_WMI_INSTANCE = 'DISPLAY\\DEL4278\\5&391b0070&0&UID257_0'
const LEFT_DELL_SERIAL = '52KH2P3'
const RIGHT_DELL_SERIAL = 'H1KH2P3'

function dell(serial) {
  return { manufacturer: 'DEL', productCode: '4278', serial }
}

describe('normalizeInstancePath', () => {
  it('folds the device interface name and the WMI instance name onto the same value', () => {
    expect(normalizeInstancePath(LEFT_DELL_INTERFACE)).toBe(normalizeInstancePath(LEFT_DELL_WMI_INSTANCE))
  })

  it('keeps two monitors on different ports apart', () => {
    expect(normalizeInstancePath(LEFT_DELL_INTERFACE)).not.toBe(normalizeInstancePath(RIGHT_DELL_INTERFACE))
  })

  it('rejects a value that carries no device path', () => {
    expect(normalizeInstancePath('')).toBeNull()
    expect(normalizeInstancePath(null)).toBeNull()
    expect(normalizeInstancePath('DISPLAY')).toBeNull()
  })
})

describe('edidMonitorKey', () => {
  it('builds a key from the manufacturer, product code and serial', () => {
    expect(edidMonitorKey(dell(LEFT_DELL_SERIAL))).toBe(`${EDID_KEY_PREFIX}DEL-4278-52KH2P3`)
  })

  it('has no key for a panel whose EDID serial is blank', () => {
    expect(edidMonitorKey(dell(''))).toBeNull()
    expect(edidMonitorKey(dell('   '))).toBeNull()
    expect(edidMonitorKey(null)).toBeNull()
  })
})

describe('assignStableMonitorKeys', () => {
  it('gives two identical monitors distinct keys from their distinct serials', () => {
    const keys = assignStableMonitorKeys([
      { id: '\\\\.\\DISPLAY3', instancePath: LEFT_DELL_INTERFACE, edid: dell(LEFT_DELL_SERIAL) },
      { id: '\\\\.\\DISPLAY2', instancePath: RIGHT_DELL_INTERFACE, edid: dell(RIGHT_DELL_SERIAL) },
    ])
    expect(keys.get('\\\\.\\DISPLAY3')).toBe(`${EDID_KEY_PREFIX}DEL-4278-52KH2P3`)
    expect(keys.get('\\\\.\\DISPLAY2')).toBe(`${EDID_KEY_PREFIX}DEL-4278-H1KH2P3`)
  })

  it('survives the DISPLAYn name swap, because the key follows the panel and not the name', () => {
    const beforeUnplug = assignStableMonitorKeys([
      { id: '\\\\.\\DISPLAY3', instancePath: LEFT_DELL_INTERFACE, edid: dell(LEFT_DELL_SERIAL) },
      { id: '\\\\.\\DISPLAY2', instancePath: RIGHT_DELL_INTERFACE, edid: dell(RIGHT_DELL_SERIAL) },
    ])
    const afterReplug = assignStableMonitorKeys([
      { id: '\\\\.\\DISPLAY2', instancePath: LEFT_DELL_INTERFACE, edid: dell(LEFT_DELL_SERIAL) },
      { id: '\\\\.\\DISPLAY3', instancePath: RIGHT_DELL_INTERFACE, edid: dell(RIGHT_DELL_SERIAL) },
    ])
    expect(afterReplug.get('\\\\.\\DISPLAY2')).toBe(beforeUnplug.get('\\\\.\\DISPLAY3'))
    expect(afterReplug.get('\\\\.\\DISPLAY3')).toBe(beforeUnplug.get('\\\\.\\DISPLAY2'))
  })

  it('falls back to the port for a panel with a blank serial', () => {
    const keys = assignStableMonitorKeys([
      { id: 'ddc-0', instancePath: LEFT_DELL_INTERFACE, edid: dell('') },
    ])
    expect(keys.get('ddc-0')).toBe(portMonitorKey(LEFT_DELL_INTERFACE))
    expect(keys.get('ddc-0').startsWith(PORT_KEY_PREFIX)).toBe(true)
  })

  it('falls back to the port when two units report the same serial', () => {
    const keys = assignStableMonitorKeys([
      { id: 'left', instancePath: LEFT_DELL_INTERFACE, edid: dell('0') },
      { id: 'right', instancePath: RIGHT_DELL_INTERFACE, edid: dell('0') },
    ])
    expect(keys.get('left')).toBe(portMonitorKey(LEFT_DELL_INTERFACE))
    expect(keys.get('right')).toBe(portMonitorKey(RIGHT_DELL_INTERFACE))
    expect(keys.get('left')).not.toBe(keys.get('right'))
  })

  it('has no key for a monitor that is attached but reports neither EDID nor a device path', () => {
    const keys = assignStableMonitorKeys([
      { id: 'ddc-0', instancePath: null, edid: null },
    ])
    expect(keys.get('ddc-0')).toBeNull()
  })
})

describe('isPersistableMonitorKey', () => {
  it('accepts the keys this module hands out', () => {
    expect(isPersistableMonitorKey(BUILTIN_MONITOR_KEY)).toBe(true)
    expect(isPersistableMonitorKey(edidMonitorKey(dell(LEFT_DELL_SERIAL)))).toBe(true)
    expect(isPersistableMonitorKey(portMonitorKey(LEFT_DELL_INTERFACE))).toBe(true)
  })

  it('rejects a GDI display name, which Windows reassigns across hotplug', () => {
    expect(isPersistableMonitorKey('\\\\.\\DISPLAY3')).toBe(false)
    expect(isPersistableMonitorKey(null)).toBe(false)
    expect(isPersistableMonitorKey(undefined)).toBe(false)
  })

  it('rejects a monitor with no stable identity at all', () => {
    const keys = assignStableMonitorKeys([{ id: 'ddc-0', instancePath: null, edid: null }])
    expect(isPersistableMonitorKey(keys.get('ddc-0'))).toBe(false)
  })
})

describe('migratePersistedBaselines', () => {
  it('discards a baseline keyed by a GDI display name instead of applying it to another monitor', () => {
    const { baselines, discarded } = migratePersistedBaselines({ '\\\\.\\DISPLAY3': 100 })
    expect(baselines.size).toBe(0)
    expect(discarded).toEqual(['\\\\.\\DISPLAY3'])
  })

  it('carries the old built-in display baseline onto the stable built-in key', () => {
    const { baselines, discarded } = migratePersistedBaselines({ [LEGACY_BUILTIN_MONITOR_ID]: 70 })
    expect(baselines.get(BUILTIN_MONITOR_KEY)).toBe(70)
    expect(discarded).toEqual([])
  })

  it('keeps baselines that already carry a stable key', () => {
    const edidKey = edidMonitorKey(dell(LEFT_DELL_SERIAL))
    const portKey = portMonitorKey(RIGHT_DELL_INTERFACE)
    const { baselines, discarded } = migratePersistedBaselines({ [edidKey]: 80, [portKey]: 55 })
    expect(baselines.get(edidKey)).toBe(80)
    expect(baselines.get(portKey)).toBe(55)
    expect(discarded).toEqual([])
  })

  it('discards a non numeric baseline', () => {
    const { baselines, discarded } = migratePersistedBaselines({ [BUILTIN_MONITOR_KEY]: 'bright' })
    expect(baselines.size).toBe(0)
    expect(discarded).toEqual([BUILTIN_MONITOR_KEY])
  })

  it('reads an empty store without throwing', () => {
    expect(migratePersistedBaselines(null).baselines.size).toBe(0)
    expect(migratePersistedBaselines(undefined).discarded).toEqual([])
  })
})

describe('parseMonitorEdidRows', () => {
  it('keys the EDID rows by the same normalised path the device interface name yields', () => {
    const rows = parseMonitorEdidRows([
      `${LEFT_DELL_WMI_INSTANCE}|DEL|4278|${LEFT_DELL_SERIAL}`,
      `${RIGHT_DELL_WMI_INSTANCE}|DEL|4278|${RIGHT_DELL_SERIAL}`,
    ].join('\r\n'))
    expect(rows.get(normalizeInstancePath(LEFT_DELL_INTERFACE)).serial).toBe(LEFT_DELL_SERIAL)
    expect(rows.get(normalizeInstancePath(RIGHT_DELL_INTERFACE)).serial).toBe(RIGHT_DELL_SERIAL)
  })

  it('ignores blank and malformed lines', () => {
    const rows = parseMonitorEdidRows(`\n  \nnot-a-row\n${LEFT_DELL_WMI_INSTANCE}|DEL|4278|`)
    expect(rows.size).toBe(1)
    expect(rows.get(normalizeInstancePath(LEFT_DELL_WMI_INSTANCE)).serial).toBe('')
  })

  it('reads an empty query result without throwing', () => {
    expect(parseMonitorEdidRows('').size).toBe(0)
    expect(parseMonitorEdidRows(null).size).toBe(0)
  })
})

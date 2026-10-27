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
  attachedPortSignature,
  createMonitorIdentityCache,
  isPersistableMonitorKey,
  migratePersistedBaselines,
  indexEdidByInstancePath,
  isInternalVideoOutput,
  parseMonitorEdidRows,
} = monitorIdentity

const LEFT_DELL_INTERFACE = '\\\\?\\DISPLAY#DEL4278#5&391b0070&0&UID278#{e6f07b5f-ee97-4a90-b076-33f57bf4eaa7}'
const RIGHT_DELL_INTERFACE = '\\\\?\\DISPLAY#DEL4278#5&391b0070&0&UID257#{e6f07b5f-ee97-4a90-b076-33f57bf4eaa7}'
const LEFT_DELL_WMI_INSTANCE = 'DISPLAY\\DEL4278\\5&391b0070&0&UID278_0'
const RIGHT_DELL_WMI_INSTANCE = 'DISPLAY\\DEL4278\\5&391b0070&0&UID257_0'
const LEFT_DELL_SERIAL = '52KH2P3'
const RIGHT_DELL_SERIAL = 'H1KH2P3'
const LEFT_DELL_DEVICE_NAME = '\\\\.\\DISPLAY3'
const RIGHT_DELL_DEVICE_NAME = '\\\\.\\DISPLAY2'

function dell(serial) {
  return { manufacturer: 'DEL', productCode: '4278', serial }
}

function panelKey(serial) {
  return `${EDID_KEY_PREFIX}DEL-4278-${serial}`
}

function dellEdidRows(leftSerial, rightSerial) {
  return parseMonitorEdidRows([
    `${LEFT_DELL_WMI_INSTANCE}|DEL|4278|${leftSerial}`,
    `${RIGHT_DELL_WMI_INSTANCE}|DEL|4278|${rightSerial}`,
  ].join('\r\n'))
}

function countingEdidReader(leftSerial, rightSerial) {
  const reader = () => {
    reader.calls++
    return Promise.resolve(dellEdidRows(leftSerial, rightSerial))
  }
  reader.calls = 0
  return reader
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

  it('falls back to the port when a panel outside the enumerable set reports the same serial', () => {
    const keys = assignStableMonitorKeys(
      [{ id: 'left', instancePath: LEFT_DELL_INTERFACE, edid: dell(LEFT_DELL_SERIAL) }],
      [dell(LEFT_DELL_SERIAL), dell(LEFT_DELL_SERIAL)],
    )
    expect(keys.get('left')).toBe(portMonitorKey(LEFT_DELL_INTERFACE))
  })

  it('keeps the EDID key when the wider attached set reports that serial exactly once', () => {
    const keys = assignStableMonitorKeys(
      [{ id: 'left', instancePath: LEFT_DELL_INTERFACE, edid: dell(LEFT_DELL_SERIAL) }],
      [dell(LEFT_DELL_SERIAL), dell(RIGHT_DELL_SERIAL)],
    )
    expect(keys.get('left')).toBe(panelKey(LEFT_DELL_SERIAL))
  })
})

describe('attachedPortSignature', () => {
  it('does not depend on the order the displays are enumerated in', () => {
    expect(attachedPortSignature([LEFT_DELL_INTERFACE, RIGHT_DELL_INTERFACE]))
      .toBe(attachedPortSignature([RIGHT_DELL_INTERFACE, LEFT_DELL_INTERFACE]))
  })

  it('changes when a display leaves the attached set', () => {
    expect(attachedPortSignature([LEFT_DELL_INTERFACE, RIGHT_DELL_INTERFACE]))
      .not.toBe(attachedPortSignature([LEFT_DELL_INTERFACE]))
  })

  it('folds the device interface name and the WMI instance name onto one signature', () => {
    expect(attachedPortSignature([LEFT_DELL_INTERFACE])).toBe(attachedPortSignature([LEFT_DELL_WMI_INSTANCE]))
  })
})

describe('createMonitorIdentityCache', () => {
  const BOTH_DELLS = [
    { id: LEFT_DELL_DEVICE_NAME, instancePath: LEFT_DELL_INTERFACE },
    { id: RIGHT_DELL_DEVICE_NAME, instancePath: RIGHT_DELL_INTERFACE },
  ]

  it('gives a panel moved one port over its own key, not the key cached for that port', async () => {
    const cache = createMonitorIdentityCache()
    const beforeSwap = await cache.stableKeysForDisplays(BOTH_DELLS, countingEdidReader(LEFT_DELL_SERIAL, RIGHT_DELL_SERIAL))
    expect(beforeSwap.get(LEFT_DELL_DEVICE_NAME)).toBe(panelKey(LEFT_DELL_SERIAL))
    expect(cache.rememberedStableKey(LEFT_DELL_INTERFACE)).toBe(panelKey(LEFT_DELL_SERIAL))

    cache.invalidate()

    const afterSwap = await cache.stableKeysForDisplays(BOTH_DELLS, countingEdidReader(RIGHT_DELL_SERIAL, LEFT_DELL_SERIAL))
    expect(afterSwap.get(LEFT_DELL_DEVICE_NAME)).toBe(panelKey(RIGHT_DELL_SERIAL))
    expect(afterSwap.get(RIGHT_DELL_DEVICE_NAME)).toBe(panelKey(LEFT_DELL_SERIAL))
    expect(cache.rememberedStableKey(LEFT_DELL_INTERFACE)).toBe(panelKey(RIGHT_DELL_SERIAL))
  })

  it('discards panel identities that a display change invalidated while the query was in flight', async () => {
    const cache = createMonitorIdentityCache()
    let swapHappened = false
    const readInterruptedByASwap = () => {
      if (swapHappened) return Promise.resolve(dellEdidRows(RIGHT_DELL_SERIAL, LEFT_DELL_SERIAL))
      swapHappened = true
      cache.invalidate()
      return Promise.resolve(dellEdidRows(LEFT_DELL_SERIAL, RIGHT_DELL_SERIAL))
    }

    const keys = await cache.stableKeysForDisplays(BOTH_DELLS, readInterruptedByASwap)

    expect(keys.get(LEFT_DELL_DEVICE_NAME)).toBe(panelKey(RIGHT_DELL_SERIAL))
    expect(keys.get(RIGHT_DELL_DEVICE_NAME)).toBe(panelKey(LEFT_DELL_SERIAL))
    expect(cache.rememberedStableKey(LEFT_DELL_INTERFACE)).toBe(panelKey(RIGHT_DELL_SERIAL))
    expect(cache.rememberedStableKey(RIGHT_DELL_INTERFACE)).toBe(panelKey(LEFT_DELL_SERIAL))
  })

  it('gives up on the panel identities rather than retrying forever while display changes keep arriving', async () => {
    const cache = createMonitorIdentityCache()
    let reads = 0
    const readInterruptedEveryTime = () => {
      reads++
      if (reads > 10) throw new Error('stableKeysForDisplays retried without a bound')
      cache.invalidate()
      return Promise.resolve(dellEdidRows(LEFT_DELL_SERIAL, RIGHT_DELL_SERIAL))
    }

    const keys = await cache.stableKeysForDisplays(BOTH_DELLS, readInterruptedEveryTime)

    expect(keys.get(LEFT_DELL_DEVICE_NAME)).toBeNull()
    expect(keys.get(RIGHT_DELL_DEVICE_NAME)).toBeNull()
    expect(cache.rememberedStableKey(LEFT_DELL_INTERFACE)).toBeNull()
  })

  it('remembers no key for a port once the attached set is invalidated', async () => {
    const cache = createMonitorIdentityCache()
    await cache.stableKeysForDisplays(BOTH_DELLS, countingEdidReader(LEFT_DELL_SERIAL, RIGHT_DELL_SERIAL))
    cache.invalidate()
    expect(cache.rememberedStableKey(LEFT_DELL_INTERFACE)).toBeNull()
  })

  it('reads the panel identities again after invalidation, though every display already carried a key', async () => {
    const cache = createMonitorIdentityCache()
    const reader = countingEdidReader(LEFT_DELL_SERIAL, RIGHT_DELL_SERIAL)
    await cache.stableKeysForDisplays(BOTH_DELLS, reader)
    cache.invalidate()
    await cache.stableKeysForDisplays(BOTH_DELLS, reader)
    expect(reader.calls).toBe(2)
  })

  it('reads the panel identities again when a display leaves the attached set', async () => {
    const cache = createMonitorIdentityCache()
    const reader = countingEdidReader(LEFT_DELL_SERIAL, RIGHT_DELL_SERIAL)
    await cache.stableKeysForDisplays(BOTH_DELLS, reader)
    await cache.stableKeysForDisplays([BOTH_DELLS[0]], reader)
    expect(reader.calls).toBe(2)
  })

  it('does not read the panel identities again while the attached set is unchanged', async () => {
    const cache = createMonitorIdentityCache()
    const reader = countingEdidReader(LEFT_DELL_SERIAL, RIGHT_DELL_SERIAL)
    await cache.stableKeysForDisplays(BOTH_DELLS, reader)
    const again = await cache.stableKeysForDisplays(BOTH_DELLS, reader)
    expect(reader.calls).toBe(1)
    expect(again.get(LEFT_DELL_DEVICE_NAME)).toBe(panelKey(LEFT_DELL_SERIAL))
  })

  it('keys an enumerable panel by its port when a panel it cannot enumerate reports the same serial', async () => {
    const cache = createMonitorIdentityCache()
    const keys = await cache.stableKeysForDisplays([BOTH_DELLS[0]], countingEdidReader(LEFT_DELL_SERIAL, LEFT_DELL_SERIAL))
    expect(keys.get(LEFT_DELL_DEVICE_NAME)).toBe(portMonitorKey(LEFT_DELL_INTERFACE))
  })

  it('reads a display device path once per adapter name', () => {
    const cache = createMonitorIdentityCache()
    const asked = []
    const read = (adapter) => { asked.push(adapter); return LEFT_DELL_INTERFACE }
    expect(cache.instancePathForAdapter(LEFT_DELL_DEVICE_NAME, read)).toBe(LEFT_DELL_INTERFACE)
    expect(cache.instancePathForAdapter(LEFT_DELL_DEVICE_NAME, read)).toBe(LEFT_DELL_INTERFACE)
    expect(asked).toEqual([LEFT_DELL_DEVICE_NAME])
  })

  it('reads the display device path again after a display change, because the name may name another port', () => {
    const cache = createMonitorIdentityCache()
    let attachedPath = LEFT_DELL_INTERFACE
    const read = () => attachedPath
    expect(cache.instancePathForAdapter(LEFT_DELL_DEVICE_NAME, read)).toBe(LEFT_DELL_INTERFACE)
    cache.invalidate()
    attachedPath = RIGHT_DELL_INTERFACE
    expect(cache.instancePathForAdapter(LEFT_DELL_DEVICE_NAME, read)).toBe(RIGHT_DELL_INTERFACE)
  })

  it('remembers that an adapter reported no device path instead of asking again', () => {
    const cache = createMonitorIdentityCache()
    let asked = 0
    const read = () => { asked++; return null }
    expect(cache.instancePathForAdapter(LEFT_DELL_DEVICE_NAME, read)).toBeNull()
    expect(cache.instancePathForAdapter(LEFT_DELL_DEVICE_NAME, read)).toBeNull()
    expect(asked).toBe(1)
  })

  it('never asks Windows for the device path of a display with no adapter name', () => {
    const cache = createMonitorIdentityCache()
    let asked = 0
    const read = () => { asked++; return LEFT_DELL_INTERFACE }
    expect(cache.instancePathForAdapter(null, read)).toBeNull()
    expect(asked).toBe(0)
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

describe('indexEdidByInstancePath', () => {
  it('keys identities read straight from WMI the same way as the parsed PowerShell rows', () => {
    const fromWmi = indexEdidByInstancePath([
      { instanceName: LEFT_DELL_WMI_INSTANCE, manufacturer: 'DEL', productCode: '4278', serial: LEFT_DELL_SERIAL },
      { instanceName: RIGHT_DELL_WMI_INSTANCE, manufacturer: 'DEL', productCode: '4278', serial: RIGHT_DELL_SERIAL },
    ])
    expect(fromWmi).toEqual(dellEdidRows(LEFT_DELL_SERIAL, RIGHT_DELL_SERIAL))
  })

  it('skips identities without a usable instance name', () => {
    const rows = indexEdidByInstancePath([
      { instanceName: null, manufacturer: 'DEL', productCode: '4278', serial: LEFT_DELL_SERIAL },
      { instanceName: 'DISPLAY', manufacturer: 'DEL', productCode: '4278', serial: RIGHT_DELL_SERIAL },
    ])
    expect(rows.size).toBe(0)
  })

  it('reads a missing identity list without throwing', () => {
    expect(indexEdidByInstancePath(undefined).size).toBe(0)
  })
})

describe('isInternalVideoOutput', () => {
  it('recognises the connection types of a built-in panel', () => {
    expect(isInternalVideoOutput([10, 2147483648])).toBe(true)
    expect(isInternalVideoOutput([11])).toBe(true)
  })

  it('treats external connections alone as no built-in panel', () => {
    expect(isInternalVideoOutput([5, 10])).toBe(false)
    expect(isInternalVideoOutput([])).toBe(false)
  })
})

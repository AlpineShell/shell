import { describe, it, expect } from 'vitest'
import { buildInterfaceGeneration, decodeBssEntry, decodeConnectionDetails, decodeRadioState, decodeSsid, decodeWiredConnection } from './networkNative.js'

const CONNECTION_SSID_LENGTH_OFFSET = 520
const CONNECTION_SSID_OFFSET = 524
const CONNECTION_STRUCT_BYTES = 604
const MIB_IF_TABLE_HEADER_BYTES = 8
const MIB_IF_ROW_BYTES = 1352

function wiredTableFor(entries) {
  const buffer = Buffer.alloc(MIB_IF_TABLE_HEADER_BYTES + entries.length * MIB_IF_ROW_BYTES)
  buffer.writeUInt32LE(entries.length, 0)
  entries.forEach(({ type, flags, operStatus, mediaConnectState }, index) => {
    const base = MIB_IF_TABLE_HEADER_BYTES + index * MIB_IF_ROW_BYTES
    buffer.writeUInt32LE(type, base + 1128)
    buffer.writeUInt8(flags, base + 1152)
    buffer.writeUInt32LE(operStatus, base + 1156)
    buffer.writeUInt32LE(mediaConnectState, base + 1164)
  })
  return buffer
}

function connectionBufferFor(ssid) {
  const buffer = Buffer.alloc(CONNECTION_STRUCT_BYTES)
  const encoded = Buffer.from(ssid, 'utf8')
  buffer.writeUInt32LE(encoded.length, CONNECTION_SSID_LENGTH_OFFSET)
  encoded.copy(buffer, CONNECTION_SSID_OFFSET)
  return buffer
}

function radioBufferFor(phyStates) {
  const buffer = Buffer.alloc(4 + phyStates.length * 12)
  buffer.writeUInt32LE(phyStates.length, 0)
  phyStates.forEach(([software, hardware], index) => {
    const base = 4 + index * 12
    buffer.writeUInt32LE(index, base)
    buffer.writeUInt32LE(software, base + 4)
    buffer.writeUInt32LE(hardware, base + 8)
  })
  return buffer
}

describe('decodeSsid', () => {
  it('reads exactly the declared number of bytes', () => {
    expect(decodeSsid(connectionBufferFor('LAN SOLO'))).toBe('LAN SOLO')
  })

  it('decodes a multi-byte utf8 name', () => {
    expect(decodeSsid(connectionBufferFor('Café Réseau'))).toBe('Café Réseau')
  })

  it('returns null for a hidden network with no name', () => {
    expect(decodeSsid(connectionBufferFor(''))).toBeNull()
  })

  it('never reads past the 32-byte dot11 ssid field', () => {
    const buffer = connectionBufferFor('')
    buffer.writeUInt32LE(4096, CONNECTION_SSID_LENGTH_OFFSET)
    buffer.fill(0x41, CONNECTION_SSID_OFFSET, CONNECTION_SSID_OFFSET + 64)
    expect(decodeSsid(buffer)).toBe('A'.repeat(32))
  })
})

describe('decodeRadioState', () => {
  it('reports on when every radio is on', () => {
    expect(decodeRadioState(radioBufferFor([[1, 1], [1, 1]]))).toBe('on')
  })

  it('reports off when the software radio is off', () => {
    expect(decodeRadioState(radioBufferFor([[1, 1], [2, 1]]))).toBe('off')
  })

  it('reports off when the hardware radio is off', () => {
    expect(decodeRadioState(radioBufferFor([[1, 2]]))).toBe('off')
  })

  it('reports unavailable when the adapter exposes no radio', () => {
    expect(decodeRadioState(radioBufferFor([]))).toBe('unavailable')
  })

  it('reports unavailable rather than reading past a truncated buffer', () => {
    const truncated = radioBufferFor([[1, 1]]).subarray(0, 10)
    expect(decodeRadioState(truncated)).toBe('unavailable')
  })
})

describe('buildInterfaceGeneration', () => {
  it('changes when an interface goes up', () => {
    const down = buildInterfaceGeneration([{ ifIndex: 27, ifType: 6, operStatus: 2 }])
    const up = buildInterfaceGeneration([{ ifIndex: 27, ifType: 6, operStatus: 1 }])
    expect(up).not.toBe(down)
  })

  it('changes when an interface appears', () => {
    const one = buildInterfaceGeneration([{ ifIndex: 24, ifType: 71, operStatus: 1 }])
    const two = buildInterfaceGeneration([
      { ifIndex: 24, ifType: 71, operStatus: 1 },
      { ifIndex: 27, ifType: 6, operStatus: 1 },
    ])
    expect(two).not.toBe(one)
  })

  it('is stable across enumeration order', () => {
    const forward = buildInterfaceGeneration([
      { ifIndex: 1, ifType: 24, operStatus: 1 },
      { ifIndex: 24, ifType: 71, operStatus: 1 },
    ])
    const reversed = buildInterfaceGeneration([
      { ifIndex: 24, ifType: 71, operStatus: 1 },
      { ifIndex: 1, ifType: 24, operStatus: 1 },
    ])
    expect(reversed).toBe(forward)
  })
})

function connectedBufferFor(fields) {
  const buffer = connectionBufferFor('HomeNet')
  buffer.writeUInt32LE(1, 0)
  Buffer.from([0xaa, 0xbb, 0xcc, 0x0d, 0x0e, 0x0f]).copy(buffer, 560)
  buffer.writeUInt32LE(fields.phyType, 568)
  buffer.writeUInt32LE(fields.signal, 576)
  buffer.writeUInt32LE(fields.receiveKbps, 580)
  buffer.writeUInt32LE(fields.transmitKbps, 584)
  buffer.writeUInt32LE(fields.securityEnabled ? 1 : 0, 588)
  buffer.writeUInt32LE(fields.authAlgorithm, 596)
  return buffer
}

function bssListFor(entries) {
  const buffer = Buffer.alloc(8 + entries.length * 360)
  buffer.writeUInt32LE(buffer.length, 0)
  buffer.writeUInt32LE(entries.length, 4)
  entries.forEach(({ bssid, rssi, frequencyKhz }, index) => {
    const base = 8 + index * 360
    Buffer.from(bssid).copy(buffer, base + 40)
    buffer.writeInt32LE(rssi, base + 56)
    buffer.writeUInt32LE(frequencyKhz, base + 92)
  })
  return buffer
}

describe('decodeConnectionDetails', () => {
  it('reads the link fields of a connected interface', () => {
    const buffer = connectedBufferFor({ phyType: 10, signal: 92, receiveKbps: 866700, transmitKbps: 780000, securityEnabled: true, authAlgorithm: 9 })
    expect(decodeConnectionDetails(buffer)).toEqual({
      ssid: 'HomeNet',
      bssid: 'AA:BB:CC:0D:0E:0F',
      phyType: 10,
      signalPercent: 92,
      receiveRateKbps: 866700,
      transmitRateKbps: 780000,
      securityEnabled: true,
      authAlgorithm: 9,
    })
  })

  it('reads nothing from an interface that is not connected', () => {
    expect(decodeConnectionDetails(connectionBufferFor('HomeNet'))).toBeNull()
  })

  it('reads nothing from a buffer shorter than the whole struct', () => {
    expect(decodeConnectionDetails(Buffer.alloc(590))).toBeNull()
  })
})

describe('decodeBssEntry', () => {
  it('finds the entry of the connected access point', () => {
    const list = bssListFor([
      { bssid: [1, 2, 3, 4, 5, 6], rssi: -80, frequencyKhz: 2412000 },
      { bssid: [0xaa, 0xbb, 0xcc, 0x0d, 0x0e, 0x0f], rssi: -48, frequencyKhz: 5220000 },
    ])
    expect(decodeBssEntry(list, 'AA:BB:CC:0D:0E:0F')).toEqual({ rssiDbm: -48, centerFrequencyKhz: 5220000 })
  })

  it('finds nothing when the access point is not in the list', () => {
    expect(decodeBssEntry(bssListFor([{ bssid: [1, 2, 3, 4, 5, 6], rssi: -80, frequencyKhz: 2412000 }]), 'AA:BB:CC:0D:0E:0F')).toBeNull()
  })
})

describe('decodeWiredConnection', () => {
  it('recognizes a hardware Ethernet interface with an active media link', () => {
    expect(decodeWiredConnection(wiredTableFor([{ type: 6, flags: 5, operStatus: 1, mediaConnectState: 1 }]))).toEqual({ connected: true })
  })

  it('ignores a Hyper-V style interface without the hardware flag', () => {
    expect(decodeWiredConnection(wiredTableFor([{ type: 6, flags: 4, operStatus: 1, mediaConnectState: 1 }]))).toEqual({ connected: false })
  })

  it('ignores Ethernet whose media is disconnected', () => {
    expect(decodeWiredConnection(wiredTableFor([{ type: 6, flags: 5, operStatus: 1, mediaConnectState: 2 }]))).toEqual({ connected: false })
  })

  it('ignores Wi-Fi interfaces', () => {
    expect(decodeWiredConnection(wiredTableFor([{ type: 71, flags: 5, operStatus: 1, mediaConnectState: 1 }]))).toEqual({ connected: false })
  })

  it('returns only complete matching rows from a truncated table', () => {
    const complete = wiredTableFor([
      { type: 71, flags: 5, operStatus: 1, mediaConnectState: 1 },
      { type: 6, flags: 5, operStatus: 1, mediaConnectState: 1 },
    ])
    expect(decodeWiredConnection(complete.subarray(0, MIB_IF_TABLE_HEADER_BYTES + MIB_IF_ROW_BYTES))).toEqual({ connected: false })
    expect(decodeWiredConnection(complete.subarray(0, MIB_IF_TABLE_HEADER_BYTES + MIB_IF_ROW_BYTES + 1170))).toEqual({ connected: false })
    const connectedFirstRow = wiredTableFor([
      { type: 6, flags: 5, operStatus: 1, mediaConnectState: 1 },
      { type: 71, flags: 5, operStatus: 1, mediaConnectState: 1 },
    ])
    expect(decodeWiredConnection(connectedFirstRow.subarray(0, MIB_IF_TABLE_HEADER_BYTES + MIB_IF_ROW_BYTES + 1170))).toEqual({ connected: true })
  })
})

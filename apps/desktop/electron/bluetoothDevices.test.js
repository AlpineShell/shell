import { describe, it, expect } from 'vitest'
import {
  buildStackSignature,
  groupDevices,
  inStableOrder,
  isNodeConnected,
  parseDeviceInstanceId,
  parseServiceInstanceId,
  reconcileDeviceRead,
} from './bluetoothDevices.js'

const CONNECTED = 0x0180600a
const DISCONNECTED = 0x0380600a
const DISCONNECTED_LE = 0x0380200a
const STARTED_SERVICE = 0x0180200a
const DISABLED_SERVICE = 0x01806400
const CM_PROB_DISABLED = 22
const STACK_IDS = ['BTH\\MS_BTHBRB\\6&11111111&0&1', 'BTH\\MS_BTHLE\\6&11111111&0&3']

function containerFor(address) {
  return `{c0ffee00-0000-4000-8000-${address}}`
}

function classicNode(address, overrides = {}) {
  const upper = address.toUpperCase()
  return {
    instanceId: `BTHENUM\\Dev_${upper}\\7&1a2b3c4d&0&BluetoothDevice_${upper}`,
    status: DISCONNECTED,
    problem: 0,
    name: `Headset ${address.slice(-4)}`,
    containerId: containerFor(address),
    ...overrides,
  }
}

function leNode(address, overrides = {}) {
  return {
    instanceId: `BTHLE\\Dev_${address}\\7&5e6f7a8b&0&${address}`,
    status: DISCONNECTED_LE,
    problem: 0,
    name: `Mouse ${address.slice(-4)}`,
    containerId: containerFor(address),
    ...overrides,
  }
}

function serviceNode(uuid, address, overrides = {}) {
  return {
    instanceId: `BTHENUM\\{${uuid}-0000-1000-8000-00805f9b34fb}_VID&0001abcd_PID&0001\\7&1a2b3c4d&0&${address.toUpperCase()}_C00000000`,
    status: STARTED_SERVICE,
    problem: 0,
    ...overrides,
  }
}

function disabledService(uuid, address) {
  return serviceNode(uuid, address, { status: DISABLED_SERVICE, problem: CM_PROB_DISABLED })
}

function audioServices(address) {
  return ['0000110b', '0000111e', '0000110c', '0000110e'].map((uuid) => serviceNode(uuid, address))
}

describe('parseDeviceInstanceId', () => {
  it('reads a Classic device node with a lowercase address', () => {
    expect(parseDeviceInstanceId(classicNode('00a1b2c3d4e5').instanceId)).toEqual({ transport: 'classic', address: '00a1b2c3d4e5' })
  })

  it('reads an LE device node', () => {
    expect(parseDeviceInstanceId(leNode('0011223344ff').instanceId)).toEqual({ transport: 'le', address: '0011223344ff' })
  })

  it('rejects service nodes, short addresses and junk', () => {
    expect(parseDeviceInstanceId(serviceNode('0000110b', '001122334455').instanceId)).toBeNull()
    expect(parseDeviceInstanceId('BTHENUM\\Dev_00112233445\\x')).toBeNull()
    expect(parseDeviceInstanceId(undefined)).toBeNull()
  })
})

describe('parseServiceInstanceId', () => {
  it('reads the profile uuid and the address from a service node', () => {
    expect(parseServiceInstanceId(serviceNode('0000111E', '00AABBCCDDEE').instanceId)).toEqual({ uuid: '0000111e', address: '00aabbccddee' })
  })

  it('rejects device nodes', () => {
    expect(parseServiceInstanceId(classicNode('001122334455').instanceId)).toBeNull()
  })
})

describe('isNodeConnected', () => {
  it('is connected only when started, without a problem and without the disconnected flag', () => {
    expect(isNodeConnected({ status: CONNECTED, problem: 0 })).toBe(true)
    expect(isNodeConnected({ status: DISCONNECTED, problem: 0 })).toBe(false)
    expect(isNodeConnected({ status: DISCONNECTED_LE, problem: 0 })).toBe(false)
    expect(isNodeConnected({ status: CONNECTED, problem: 10 })).toBe(false)
    expect(isNodeConnected({ status: CONNECTED & ~0x8, problem: 0 })).toBe(false)
  })
})

describe('groupDevices', () => {
  it('merges Classic and LE nodes that share a container into one device named from the Classic node', () => {
    const address = '0011aa22bb33'
    const [device] = groupDevices({ nodes: [leNode(address, { name: 'LE name' }), classicNode(address, { name: 'Buds' }), ...audioServices(address)] })

    expect(device).toMatchObject({ id: containerFor(address), name: 'Buds', classicAddress: address, leAddress: address })
  })

  it('reports an LE-only link as connected without a Classic connection', () => {
    const address = '0011aa22bb33'
    const [device] = groupDevices({ nodes: [classicNode(address), leNode(address, { status: CONNECTED }), ...audioServices(address)] })

    expect(device.connected).toBe(true)
    expect(device.classicConnected).toBe(false)
  })

  it('reports a Classic link as a Classic connection', () => {
    const address = '0011aa22bb33'
    const [device] = groupDevices({ nodes: [classicNode(address, { status: CONNECTED }), ...audioServices(address)] })

    expect(device.connected).toBe(true)
    expect(device.classicConnected).toBe(true)
  })

  it('keeps two devices that share a name apart', () => {
    const devices = groupDevices({
      nodes: [classicNode('001122334455', { name: 'Buds' }), classicNode('00aabbccddee', { name: 'Buds' })],
    })

    expect(devices).toHaveLength(2)
  })

  it('falls back to the address when the container is missing or the null container', () => {
    const devices = groupDevices({
      nodes: [
        classicNode('001122334455', { containerId: null }),
        classicNode('00aabbccddee', { containerId: '{00000000-0000-0000-FFFF-FFFFFFFFFFFF}' }),
      ],
    })

    expect(devices.map((device) => device.id).sort()).toEqual(['bt-001122334455', 'bt-00aabbccddee'])
  })

  it('offers Connect through the usable A2DP and Hands-Free nodes only', () => {
    const address = '001122334455'
    const [device] = groupDevices({ nodes: [classicNode(address), ...audioServices(address)] })

    expect(device.canConnect).toBe(true)
    expect(device.audioDisabled).toBe(false)
    expect(device.audioSinkNodeIds).toHaveLength(2)
    expect(device.audioSinkNodeIds.every((id) => /\{0000(110b|111e)-/.test(id))).toBe(true)
  })

  it('marks audio as turned off when the A2DP node is disabled', () => {
    const address = '001122334455'
    const services = [disabledService('0000110b', address), serviceNode('0000111e', address)]
    const [device] = groupDevices({ nodes: [classicNode(address), ...services] })

    expect(device.audioDisabled).toBe(true)
    expect(device.canConnect).toBe(false)
  })

  it('marks audio as turned off when every audio service is disabled', () => {
    const address = '001122334455'
    const services = ['0000110b', '0000111e', '0000110c', '0000110e'].map((uuid) => disabledService(uuid, address))
    const [device] = groupDevices({ nodes: [classicNode(address), ...services] })

    expect(device.audioDisabled).toBe(true)
  })

  it('leaves Connect available when only a remote-control profile is disabled', () => {
    const address = '001122334455'
    const services = [serviceNode('0000110b', address), serviceNode('0000111e', address), disabledService('0000110c', address)]
    const [device] = groupDevices({ nodes: [classicNode(address), ...services] })

    expect(device.audioDisabled).toBe(false)
    expect(device.canConnect).toBe(true)
  })

  it('offers no Connect for an LE-only device or a Classic device without audio', () => {
    const devices = groupDevices({ nodes: [leNode('00aabbccddee'), classicNode('001122334455')] })

    expect(devices.every((device) => device.canConnect === false)).toBe(true)
    expect(devices.find((device) => device.leAddress === '00aabbccddee').classicAddress).toBeNull()
  })

  it('names a device without a friendly name after its address', () => {
    const [device] = groupDevices({ nodes: [classicNode('001122334455', { name: null })] })

    expect(device.name).toBe('00:11:22:33:44:55')
  })
})

describe('inStableOrder', () => {
  it('orders by name ignoring case, then by id', () => {
    const ordered = inStableOrder([
      { id: 'b', name: 'mouse' },
      { id: 'c', name: 'Buds' },
      { id: 'a', name: 'buds' },
    ])

    expect(ordered.map((device) => device.id)).toEqual(['a', 'c', 'b'])
  })

  it('keeps a device in place when it connects', () => {
    const before = [{ id: 'a', name: 'Alpha', connected: false }, { id: 'z', name: 'Zulu', connected: false }]
    const after = [{ id: 'a', name: 'Alpha', connected: false }, { id: 'z', name: 'Zulu', connected: true }]

    expect(inStableOrder(after).map((device) => device.id)).toEqual(inStableOrder(before).map((device) => device.id))
  })
})

describe('buildStackSignature', () => {
  it('ignores enumeration order', () => {
    expect(buildStackSignature([...STACK_IDS].reverse())).toBe(buildStackSignature(STACK_IDS))
  })

  it('changes when an enumerator appears or disappears', () => {
    expect(buildStackSignature(STACK_IDS.slice(0, 1))).not.toBe(buildStackSignature(STACK_IDS))
    expect(buildStackSignature([])).not.toBe(buildStackSignature(STACK_IDS))
  })
})

describe('reconcileDeviceRead', () => {
  const previousDevices = [{ id: 'a', name: 'Buds', connected: true, classicConnected: true }]
  const signature = buildStackSignature(STACK_IDS)

  it('accepts the first read', () => {
    const read = reconcileDeviceRead({ previousDevices: [], previousSignature: null }, { devices: previousDevices, stackIds: STACK_IDS })

    expect(read).toEqual({ devices: previousDevices, signature, confirmed: true, stackChanged: false })
  })

  it('keeps the known devices, disconnected, while the Bluetooth stack is gone', () => {
    const read = reconcileDeviceRead({ previousDevices, previousSignature: signature }, { devices: [], stackIds: [] })

    expect(read.confirmed).toBe(false)
    expect(read.stackChanged).toBe(true)
    expect(read.devices).toEqual([{ id: 'a', name: 'Buds', connected: false, classicConnected: false }])
  })

  it('holds the previous devices for the read in which the stack changes', () => {
    const read = reconcileDeviceRead({ previousDevices, previousSignature: '' }, { devices: [], stackIds: STACK_IDS })

    expect(read).toMatchObject({ devices: previousDevices, confirmed: false, stackChanged: true })
  })

  it('accepts an empty list while the stack is steady', () => {
    const read = reconcileDeviceRead({ previousDevices, previousSignature: signature }, { devices: [], stackIds: STACK_IDS })

    expect(read).toMatchObject({ devices: [], confirmed: true })
  })

  it('accepts devices reported without a Microsoft stack enumerator', () => {
    const devices = [{ id: 'b', name: 'Speaker', connected: false, classicConnected: false }]
    const read = reconcileDeviceRead({ previousDevices: [], previousSignature: '' }, { devices, stackIds: [] })

    expect(read).toMatchObject({ devices, confirmed: true })
  })
})

const { parentPort } = require('worker_threads')
const bluetoothNative = require('./bluetoothNative')

const HANDLERS = {
  'read-nodes': () => bluetoothNative.readBluetoothNodes(),
  'connect-device': (request) => bluetoothNative.connectDevice(request),
  'disconnect-device': (request) => bluetoothNative.disconnectDevice(request),
  'disconnect-link': (request) => bluetoothNative.disconnectClassicLink(request),
}

function answer(request) {
  const handler = HANDLERS[request.type]
  if (!handler) return { id: request.id, error: `unknown request ${request.type}` }
  try {
    return { id: request.id, value: handler(request) }
  } catch (e) {
    return { id: request.id, error: e?.message ?? String(e) }
  }
}

parentPort.on('message', (request) => parentPort.postMessage(answer(request)))

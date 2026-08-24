const { parentPort } = require('worker_threads')
const koffi = require('koffi')

const INFINITE = 0xFFFFFFFF
const WAIT_OBJECT_0 = 0

const kernel32 = koffi.load('kernel32.dll')
const waitForSingleObject = kernel32.func('__stdcall', 'WaitForSingleObject', 'uint32', ['uintptr_t', 'uint32'])

parentPort.on('message', (request) => {
  if (request.stop) {
    parentPort.close()
    return
  }
  try {
    const rc = waitForSingleObject(request.handle, INFINITE)
    parentPort.postMessage({ signalled: rc === WAIT_OBJECT_0, detail: String(rc) })
  } catch (e) {
    parentPort.postMessage({ signalled: false, detail: e.message })
  }
})

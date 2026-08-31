const { parentPort } = require('worker_threads')
const koffi = require('koffi')

const WM_NULL = 0x0000
const SMTO_ABORTIFHUNG = 0x0002

const user32 = koffi.load('user32.dll')
const SendMessageTimeoutW = user32.func('__stdcall', 'SendMessageTimeoutW', 'intptr_t', ['uintptr_t', 'uint32', 'uintptr_t', 'intptr_t', 'uint32', 'uint32', 'void *'])

function elapsedMillisecondsSince(startedAt) {
  return Number(process.hrtime.bigint() - startedAt) / 1e6
}

parentPort.on('message', (request) => {
  if (request.stop) {
    parentPort.close()
    return
  }
  try {
    const answered = SendMessageTimeoutW(request.hwnd, WM_NULL, 0, 0, SMTO_ABORTIFHUNG, request.timeoutMs, null)
    parentPort.postMessage({ latencyMs: elapsedMillisecondsSince(request.startedAt), timedOut: !answered })
  } catch (e) {
    parentPort.postMessage({ failed: true, detail: e.message })
  }
})

const { parentPort } = require('worker_threads')
const koffi = require('koffi')

const COINIT_APARTMENTTHREADED = 0x2
const COINIT_DISABLE_OLE1DDE = 0x4
const SEE_MASK_FLAG_NO_UI = 0x00000400
const SW_SHOWNORMAL = 1

const shell32 = koffi.load('shell32.dll')
const ole32 = koffi.load('ole32.dll')

const execInfo = koffi.struct('AlpineShellExecuteInfoW', {
  cbSize: 'uint32',
  fMask: 'uint32',
  hwnd: 'uintptr_t',
  lpVerb: 'str16',
  lpFile: 'str16',
  lpParameters: 'str16',
  lpDirectory: 'str16',
  nShow: 'int32',
  hInstApp: 'uintptr_t',
  lpIDList: 'void *',
  lpClass: 'str16',
  hkeyClass: 'uintptr_t',
  dwHotKey: 'uint32',
  hIcon: 'uintptr_t',
  hProcess: 'uintptr_t',
})

const shellExecuteEx = shell32.func('__stdcall', 'ShellExecuteExW', 'int', [koffi.inout(koffi.pointer(execInfo))])
const coInitializeEx = ole32.func('__stdcall', 'CoInitializeEx', 'long', ['void *', 'uint32'])

coInitializeEx(null, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE)

parentPort.postMessage({ ready: true })

parentPort.on('message', (request) => {
  const info = {
    cbSize: koffi.sizeof(execInfo),
    fMask: SEE_MASK_FLAG_NO_UI,
    hwnd: 0,
    lpVerb: request.verb || null,
    lpFile: request.file,
    lpParameters: request.args || null,
    lpDirectory: null,
    nShow: SW_SHOWNORMAL,
    hInstApp: 0,
    lpIDList: null,
    lpClass: null,
    hkeyClass: 0,
    dwHotKey: 0,
    hIcon: 0,
    hProcess: 0,
  }
  try {
    const ok = shellExecuteEx(info)
    parentPort.postMessage({ id: request.id, ok: !!ok, detail: String(info.hInstApp) })
  } catch (e) {
    parentPort.postMessage({ id: request.id, ok: false, detail: e.message })
  }
})

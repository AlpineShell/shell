const fs = require('fs')

const SEE_MASK_FLAG_NO_UI = 0x00000400
const SW_SHOWNORMAL = 1

let bindings = null
let bindingsUnavailable = false

function loadBindings() {
  if (bindings || bindingsUnavailable) return bindings
  try {
    const koffi = require('koffi')
    const shell32 = koffi.load('shell32.dll')
    const kernel32 = koffi.load('kernel32.dll')
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
    bindings = {
      infoSize: koffi.sizeof(execInfo),
      shellExecuteEx: shell32.func('__stdcall', 'ShellExecuteExW', 'int', [koffi.pointer(execInfo)]),
      getLastError: kernel32.func('__stdcall', 'GetLastError', 'uint32', []),
    }
  } catch (e) {
    bindingsUnavailable = true
    console.error('[shellExecute] shell32 binding unavailable:', e.message)
  }
  return bindings
}

function shellExecute(file, args, verb) {
  const target = String(file || '').trim()
  if (!target) return false
  const api = loadBindings()
  if (!api) return false
  try {
    const ok = api.shellExecuteEx({
      cbSize: api.infoSize,
      fMask: SEE_MASK_FLAG_NO_UI,
      hwnd: 0,
      lpVerb: verb || null,
      lpFile: target,
      lpParameters: args ? String(args) : null,
      lpDirectory: null,
      nShow: SW_SHOWNORMAL,
      hInstApp: 0,
      lpIDList: null,
      lpClass: null,
      hkeyClass: 0,
      dwHotKey: 0,
      hIcon: 0,
      hProcess: 0,
    })
    if (!ok) console.error('[shellExecute] failed for', target, 'error', api.getLastError())
    return !!ok
  } catch (e) {
    console.error('[shellExecute] threw for', target, '-', e.message)
    return false
  }
}

function existsLoose(candidate) {
  try { return fs.existsSync(candidate) } catch { return false }
}

function splitCommandLine(commandLine) {
  const text = String(commandLine || '').trim()
  if (!text) return { file: '', args: '' }
  if (text.startsWith('"')) {
    const end = text.indexOf('"', 1)
    if (end > 0) return { file: text.slice(1, end), args: text.slice(end + 1).trim() }
    return { file: text.slice(1), args: '' }
  }
  if (existsLoose(text)) return { file: text, args: '' }
  for (let space = text.indexOf(' '); space > 0; space = text.indexOf(' ', space + 1)) {
    const candidate = text.slice(0, space)
    if (existsLoose(candidate) || existsLoose(`${candidate}.exe`)) {
      return { file: candidate, args: text.slice(space + 1).trim() }
    }
  }
  const firstSpace = text.indexOf(' ')
  if (firstSpace < 0) return { file: text, args: '' }
  return { file: text.slice(0, firstSpace), args: text.slice(firstSpace + 1).trim() }
}

function shellExecuteCommandLine(commandLine) {
  const { file, args } = splitCommandLine(commandLine)
  if (!file) return false
  return shellExecute(file, args)
}

function warm() {
  loadBindings()
}

module.exports = { shellExecute, shellExecuteCommandLine, splitCommandLine, warm }

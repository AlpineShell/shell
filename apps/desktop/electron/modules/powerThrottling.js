const koffi = require('koffi')
const { app } = require('electron')

const PROCESS_INFORMATION_CLASS_POWER_THROTTLING = 4
const PROCESS_POWER_THROTTLING_CURRENT_VERSION = 1
const PROCESS_POWER_THROTTLING_EXECUTION_SPEED = 0x1
const PROCESS_SET_INFORMATION = 0x0200

let ecoQosEnabled = false

let SetProcessInformation = null
let OpenProcess = null
let CloseHandle = null
let PowerThrottlingState = null

try {
  const kernel32 = koffi.load('kernel32.dll')
  PowerThrottlingState = koffi.struct('PROCESS_POWER_THROTTLING_STATE', {
    Version: 'uint32',
    ControlMask: 'uint32',
    StateMask: 'uint32',
  })
  SetProcessInformation = kernel32.func('__stdcall', 'SetProcessInformation', 'int', ['uintptr_t', 'int', koffi.pointer(PowerThrottlingState), 'uint32'])
  OpenProcess = kernel32.func('__stdcall', 'OpenProcess', 'uintptr_t', ['uint32', 'int', 'uint32'])
  CloseHandle = kernel32.func('__stdcall', 'CloseHandle', 'int', ['uintptr_t'])
} catch (e) {
  console.error('[powerThrottling] koffi load failed:', e?.message ?? e)
}

function setEcoQosForPid(pid, enabled) {
  if (!SetProcessInformation || !OpenProcess || !CloseHandle || !PowerThrottlingState) return
  if (!pid) return
  let handle = 0
  try {
    handle = OpenProcess(PROCESS_SET_INFORMATION, 0, pid)
    if (!handle) return
    const state = {
      Version: PROCESS_POWER_THROTTLING_CURRENT_VERSION,
      ControlMask: PROCESS_POWER_THROTTLING_EXECUTION_SPEED,
      StateMask: enabled ? PROCESS_POWER_THROTTLING_EXECUTION_SPEED : 0,
    }
    const ok = SetProcessInformation(handle, PROCESS_INFORMATION_CLASS_POWER_THROTTLING, state, koffi.sizeof(PowerThrottlingState))
    if (!ok) console.error('[powerThrottling] SetProcessInformation failed for pid', pid)
  } catch (e) {
    console.error('[powerThrottling] setEcoQosForPid failed:', e?.message ?? e)
  } finally {
    if (handle) {
      try { CloseHandle(handle) } catch {}
    }
  }
}

function applyEcoQosToAllProcesses() {
  try {
    for (const metric of app.getAppMetrics()) {
      setEcoQosForPid(metric.pid, ecoQosEnabled)
    }
  } catch (e) {
    console.error('[powerThrottling] applyEcoQosToAllProcesses failed:', e?.message ?? e)
  }
}

function setEcoQosPreference(enabled) {
  if (ecoQosEnabled === !!enabled) return
  ecoQosEnabled = !!enabled
  applyEcoQosToAllProcesses()
}

module.exports = { setEcoQosForPid, applyEcoQosToAllProcesses, setEcoQosPreference }

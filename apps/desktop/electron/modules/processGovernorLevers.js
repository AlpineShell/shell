const os = require('os')
const koffi = require('koffi')

const PROCESS_SET_INFORMATION = 0x0200
const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
const PROCESS_SET_LIMITED_INFORMATION = 0x2000
const GOVERN_ACCESS = PROCESS_SET_INFORMATION | PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_SET_LIMITED_INFORMATION
const GOVERN_ACCESS_WITHOUT_CPU_SETS = PROCESS_SET_INFORMATION | PROCESS_QUERY_LIMITED_INFORMATION

const PROCESS_INFORMATION_MEMORY_PRIORITY = 0
const PROCESS_INFORMATION_POWER_THROTTLING = 4
const POWER_THROTTLING_STATE_SIZE = 12
const POWER_THROTTLING_VERSION = 1
const POWER_THROTTLING_EXECUTION_SPEED = 0x1
const POWER_THROTTLING_IGNORE_TIMER_RESOLUTION = 0x4

const MEMORY_PRIORITY_SIZE = 4
const PROCESS_IO_PRIORITY_CLASS = 33
const IO_PRIORITY_SIZE = 4
const STATUS_SUCCESS = 0

const CPU_SET_RECORD_TYPE = 0
const CPU_SET_FLAG_PARKED = 0x01
const CPU_SET_ID_OFFSET = 8
const CPU_SET_EFFICIENCY_CLASS_OFFSET = 18
const CPU_SET_FLAGS_OFFSET = 19
const CPU_SET_BUFFER_BYTES = 16384

const TIMER_RESOLUTION_MIN_BUILD = 22000
const POWER_THROTTLING_READBACK_MIN_BUILD = 22621

const MEMORYSTATUSEX_SIZE = 64
const MEMORYSTATUSEX_TOTAL_PAGEFILE_OFFSET = 24
const MEMORYSTATUSEX_AVAIL_PAGEFILE_OFFSET = 32

const IO_COUNTERS_SIZE = 48
const IO_COUNTERS_READ_TRANSFER_OFFSET = 24
const IO_COUNTERS_WRITE_TRANSFER_OFFSET = 32
const IO_COUNTERS_OTHER_TRANSFER_OFFSET = 40

let bindings = null
let capabilities = null

function windowsBuildNumber() {
  const match = /^\d+\.\d+\.(\d+)/.exec(os.release())
  return match ? Number(match[1]) : 0
}

function loadBindings() {
  if (bindings !== null) return bindings
  bindings = { kernel32: null, ntdll: null }
  try {
    const kernel32 = koffi.load('kernel32.dll')
    bindings.kernel32 = {
      OpenProcess: kernel32.func('__stdcall', 'OpenProcess', 'uintptr_t', ['uint32', 'int', 'uint32']),
      CloseHandle: kernel32.func('__stdcall', 'CloseHandle', 'int', ['uintptr_t']),
      GetLastError: kernel32.func('__stdcall', 'GetLastError', 'uint32', []),
      GetProcessInformation: kernel32.func('__stdcall', 'GetProcessInformation', 'int', ['uintptr_t', 'int', 'void *', 'uint32']),
      GetPriorityClass: kernel32.func('__stdcall', 'GetPriorityClass', 'uint32', ['uintptr_t']),
      GetProcessTimes: kernel32.func('__stdcall', 'GetProcessTimes', 'int', ['uintptr_t', 'void *', 'void *', 'void *', 'void *']),
      GetProcessIoCounters: kernel32.func('__stdcall', 'GetProcessIoCounters', 'int', ['uintptr_t', 'void *']),
      GetCurrentProcess: kernel32.func('__stdcall', 'GetCurrentProcess', 'uintptr_t', []),
      GlobalMemoryStatusEx: kernel32.func('__stdcall', 'GlobalMemoryStatusEx', 'int', ['void *']),
      GetSystemCpuSetInformation: kernel32.func('__stdcall', 'GetSystemCpuSetInformation', 'int', ['void *', 'uint32', 'void *', 'uintptr_t', 'uintptr_t']),
      GetProcessDefaultCpuSets: kernel32.func('__stdcall', 'GetProcessDefaultCpuSets', 'int', ['uintptr_t', 'void *', 'uint32', 'void *']),
    }
  } catch (e) {
    console.error('[processGovernorLevers] kernel32 bind failed:', e?.message ?? e)
  }
  try {
    const ntdll = koffi.load('ntdll.dll')
    bindings.ntdll = {
      NtQueryInformationProcess: ntdll.func('__stdcall', 'NtQueryInformationProcess', 'int32', ['uintptr_t', 'int', 'void *', 'uint32', 'void *']),
    }
  } catch (e) {
    console.error('[processGovernorLevers] ntdll bind failed:', e?.message ?? e)
  }
  return bindings
}

function openProcessHandle(pid) {
  const { kernel32 } = loadBindings()
  if (!kernel32 || !pid) return null
  let handle = kernel32.OpenProcess(GOVERN_ACCESS, 0, pid)
  let cpuSetsAllowed = true
  if (!handle) {
    handle = kernel32.OpenProcess(GOVERN_ACCESS_WITHOUT_CPU_SETS, 0, pid)
    cpuSetsAllowed = false
  }
  if (!handle) return null
  return { handle, cpuSetsAllowed }
}

function closeProcessHandle(opened) {
  const { kernel32 } = loadBindings()
  if (!kernel32 || !opened) return
  try { kernel32.CloseHandle(opened.handle) } catch (_) {}
}

function withProcess(pid, action, fallback) {
  const opened = openProcessHandle(pid)
  if (!opened) return fallback
  try {
    return action(opened)
  } catch (e) {
    console.error('[processGovernorLevers] operation failed for pid', pid, '-', e?.message ?? e)
    return fallback
  } finally {
    closeProcessHandle(opened)
  }
}

function canGovern(pid) {
  return withProcess(pid, () => true, false)
}

function readPowerThrottling(handle) {
  const { kernel32 } = loadBindings()
  if (!kernel32 || !capabilities?.powerThrottlingReadback) return null
  const state = Buffer.alloc(POWER_THROTTLING_STATE_SIZE)
  state.writeUInt32LE(POWER_THROTTLING_VERSION, 0)
  if (!kernel32.GetProcessInformation(handle, PROCESS_INFORMATION_POWER_THROTTLING, state, POWER_THROTTLING_STATE_SIZE)) return null
  return { controlMask: state.readUInt32LE(4), stateMask: state.readUInt32LE(8) }
}


function readMemoryPriority(handle) {
  const { kernel32 } = loadBindings()
  if (!kernel32) return null
  const value = Buffer.alloc(MEMORY_PRIORITY_SIZE)
  if (!kernel32.GetProcessInformation(handle, PROCESS_INFORMATION_MEMORY_PRIORITY, value, MEMORY_PRIORITY_SIZE)) return null
  return value.readUInt32LE(0)
}


function readIoPriority(handle) {
  const { ntdll } = loadBindings()
  if (!ntdll || !capabilities?.ioPriority) return null
  const value = Buffer.alloc(IO_PRIORITY_SIZE)
  const returned = Buffer.alloc(4)
  if (ntdll.NtQueryInformationProcess(handle, PROCESS_IO_PRIORITY_CLASS, value, IO_PRIORITY_SIZE, returned) !== STATUS_SUCCESS) return null
  return value.readUInt32LE(0)
}


function readEfficientCpuSetIds() {
  const { kernel32 } = loadBindings()
  if (!kernel32) return { heterogeneous: false, ids: [] }
  const required = Buffer.alloc(4)
  const buffer = Buffer.alloc(CPU_SET_BUFFER_BYTES)
  const self = kernel32.GetCurrentProcess()
  if (!kernel32.GetSystemCpuSetInformation(buffer, CPU_SET_BUFFER_BYTES, required, self, 0)) return { heterogeneous: false, ids: [] }
  const length = Math.min(required.readUInt32LE(0), CPU_SET_BUFFER_BYTES)
  const records = []
  let offset = 0
  while (offset + 8 <= length) {
    const size = buffer.readUInt32LE(offset)
    if (!size) break
    if (buffer.readUInt32LE(offset + 4) === CPU_SET_RECORD_TYPE) {
      records.push({
        id: buffer.readUInt32LE(offset + CPU_SET_ID_OFFSET),
        efficiencyClass: buffer.readUInt8(offset + CPU_SET_EFFICIENCY_CLASS_OFFSET),
        parked: (buffer.readUInt8(offset + CPU_SET_FLAGS_OFFSET) & CPU_SET_FLAG_PARKED) !== 0,
      })
    }
    offset += size
  }
  const classes = new Set(records.map((record) => record.efficiencyClass))
  if (classes.size < 2) return { heterogeneous: false, ids: [] }
  const slowest = Math.min(...classes)
  const ids = records.filter((record) => record.efficiencyClass === slowest && !record.parked).map((record) => record.id)
  return { heterogeneous: true, ids }
}


function readProcessStartTime(handle) {
  const { kernel32 } = loadBindings()
  if (!kernel32) return null
  const creation = Buffer.alloc(8)
  const exit = Buffer.alloc(8)
  const kernel = Buffer.alloc(8)
  const user = Buffer.alloc(8)
  if (!kernel32.GetProcessTimes(handle, creation, exit, kernel, user)) return null
  return creation.readBigUInt64LE(0).toString()
}

function readIoTransferTotal(handle) {
  const { kernel32 } = loadBindings()
  if (!kernel32) return null
  const counters = Buffer.alloc(IO_COUNTERS_SIZE)
  if (!kernel32.GetProcessIoCounters(handle, counters)) return null
  return Number(
    counters.readBigUInt64LE(IO_COUNTERS_READ_TRANSFER_OFFSET)
    + counters.readBigUInt64LE(IO_COUNTERS_WRITE_TRANSFER_OFFSET)
    + counters.readBigUInt64LE(IO_COUNTERS_OTHER_TRANSFER_OFFSET)
  )
}

function memoryPressurePercent() {
  const { kernel32 } = loadBindings()
  if (!kernel32) return null
  const status = Buffer.alloc(MEMORYSTATUSEX_SIZE)
  status.writeUInt32LE(MEMORYSTATUSEX_SIZE, 0)
  if (!kernel32.GlobalMemoryStatusEx(status)) return null
  const commitLimit = Number(status.readBigUInt64LE(MEMORYSTATUSEX_TOTAL_PAGEFILE_OFFSET))
  const commitAvailable = Number(status.readBigUInt64LE(MEMORYSTATUSEX_AVAIL_PAGEFILE_OFFSET))
  if (!commitLimit) return null
  return ((commitLimit - commitAvailable) / commitLimit) * 100
}

function probeIoPriorityClass() {
  const { kernel32, ntdll } = loadBindings()
  if (!kernel32 || !ntdll) return false
  const self = kernel32.GetCurrentProcess()
  const value = Buffer.alloc(IO_PRIORITY_SIZE)
  const returned = Buffer.alloc(4)
  const status = ntdll.NtQueryInformationProcess(self, PROCESS_IO_PRIORITY_CLASS, value, IO_PRIORITY_SIZE, returned)
  if (status !== STATUS_SUCCESS) return false
  if (returned.readUInt32LE(0) !== IO_PRIORITY_SIZE) return false
  return value.readUInt32LE(0) <= 4
}

function detectCapabilities() {
  if (capabilities) return capabilities
  const build = windowsBuildNumber()
  const { kernel32 } = loadBindings()
  capabilities = {
    build,
    ecoQos: Boolean(kernel32),
    powerThrottlingReadback: Boolean(kernel32) && build >= POWER_THROTTLING_READBACK_MIN_BUILD,
    ignoreTimerResolution: Boolean(kernel32) && build >= TIMER_RESOLUTION_MIN_BUILD,
    memoryPriority: Boolean(kernel32),
    ioPriority: probeIoPriorityClass(),
    cpuSets: false,
    efficientCpuSetIds: [],
  }
  const cpuSets = readEfficientCpuSetIds()
  capabilities.cpuSets = cpuSets.heterogeneous && cpuSets.ids.length > 0
  capabilities.efficientCpuSetIds = cpuSets.ids
  return capabilities
}





function readProcessSnapshot(pid) {
  return withProcess(pid, (opened) => ({
    pid,
    startTime: readProcessStartTime(opened.handle),
    ioTransferTotal: readIoTransferTotal(opened.handle),
  }), null)
}

function describeCapabilities() {
  return { ...detectCapabilities() }
}

module.exports = {
  GOVERN_ACCESS,
  windowsBuildNumber,
  memoryPressurePercent,
  canGovern,
  readProcessSnapshot,
  readEfficientCpuSetIds,
  describeCapabilities,
}

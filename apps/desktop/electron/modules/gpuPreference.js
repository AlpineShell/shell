const path = require('path')
const fs = require('fs')
const { execFile } = require('child_process')

const STORE_FILE = 'gpu-prefs.json'
const GPU_PREFERENCES_KEY = 'HKCU\\Software\\Microsoft\\DirectX\\UserGpuPreferences'
const HIGH_PERFORMANCE_VALUE = 'GpuPreference=2;'

function electronApp() {
  return require('electron').app
}

function storePath() {
  return path.join(electronApp().getPath('userData'), STORE_FILE)
}

function readStoredHighPerformance(file = storePath()) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    return typeof data?.highPerformance === 'boolean' ? data.highPerformance : null
  } catch {
    return null
  }
}

function storeHighPerformance(highPerformance, file = storePath()) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify({ highPerformance }, null, 2))
}

function prefersHighPerformanceGpu(file = storePath()) {
  return readStoredHighPerformance(file) === true
}

function startupGpuAction(storedHighPerformance) {
  if (storedHighPerformance === true) return 'pin'
  if (storedHighPerformance === null) return 'unpin'
  return 'none'
}

function pinHighPerformanceGpu() {
  try {
    const exePath = electronApp().getPath('exe')
    execFile('reg', ['add', GPU_PREFERENCES_KEY, '/v', exePath, '/t', 'REG_SZ', '/d', HIGH_PERFORMANCE_VALUE, '/f'], { windowsHide: true }, (err) => {
      if (err) console.error('[gpuPreference] Failed to pin high-performance GPU:', err.message)
    })
  } catch (e) {
    console.error('[gpuPreference] pinHighPerformanceGpu error:', e?.message ?? e)
  }
}

function unpinHighPerformanceGpu() {
  try {
    const exePath = electronApp().getPath('exe')
    execFile('reg', ['delete', GPU_PREFERENCES_KEY, '/v', exePath, '/f'], { windowsHide: true }, () => {})
  } catch (e) {
    console.error('[gpuPreference] unpinHighPerformanceGpu error:', e?.message ?? e)
  }
}

function applyStoredGpuPreference() {
  const action = startupGpuAction(readStoredHighPerformance())
  if (action === 'pin') pinHighPerformanceGpu()
  if (action !== 'unpin') return
  unpinHighPerformanceGpu()
  try {
    storeHighPerformance(false)
  } catch (e) {
    console.error('[gpuPreference] store error:', e?.message ?? e)
  }
}

function getPreferences() {
  return { highPerformance: prefersHighPerformanceGpu() }
}

function setPreferences(partial) {
  if (!partial || typeof partial.highPerformance !== 'boolean') return getPreferences()
  storeHighPerformance(partial.highPerformance)
  if (electronApp().isPackaged) {
    if (partial.highPerformance) pinHighPerformanceGpu()
    else unpinHighPerformanceGpu()
  }
  return getPreferences()
}

module.exports = {
  GPU_PREFERENCES_KEY,
  readStoredHighPerformance,
  storeHighPerformance,
  prefersHighPerformanceGpu,
  startupGpuAction,
  applyStoredGpuPreference,
  handlers: {
    'gpu/preferences-get': () => getPreferences(),
    'gpu/preferences-set': (_event, partial) => setPreferences(partial),
  },
}

const { app } = require('electron')
const { execFile } = require('child_process')

const GPU_PREFERENCE_KEY = 'HKCU\\Software\\Microsoft\\DirectX\\UserGpuPreferences'
const HIGH_PERFORMANCE_VALUE = 'GpuPreference=2;'

function pinHighPerformanceGpu() {
  try {
    const exePath = app.getPath('exe')
    execFile('reg', ['add', GPU_PREFERENCE_KEY, '/v', exePath, '/t', 'REG_SZ', '/d', HIGH_PERFORMANCE_VALUE, '/f'], { windowsHide: true }, (err) => {
      if (err) console.error('[gpuPreference] Failed to pin high-performance GPU:', err.message)
    })
  } catch (e) {
    console.error('[gpuPreference] pinHighPerformanceGpu error:', e?.message ?? e)
  }
}

module.exports = { pinHighPerformanceGpu }

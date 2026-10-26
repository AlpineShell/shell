const path = require('path')
const { groupAudioEndpoints } = require('./audioDevices')

const ADDON_PATH = path.join(__dirname, '..', 'native', 'alpine_native.node')

function bindAudioEndpoint(addon) {
  return {
    kind: 'native',
    start: async () => {},
    getState: () => addon.audioGetState(),
    setVolume: (percent) => addon.audioSetVolume(percent),
    setMute: (muted) => addon.audioSetMute(muted),
    stepVolume: (deltaPercent) => addon.audioStepVolume(deltaPercent),
    toggleMute: () => addon.audioToggleMute(),
    getPeak: () => addon.audioGetPeak(),
    listDevices: async () => groupAudioEndpoints(await addon.audioListDevices()),
    setDefaultDevice: (id) => addon.audioSetDefaultDevice(id),
  }
}

function loadNativeAudioEndpoint(requireAddon = require) {
  try {
    return bindAudioEndpoint(requireAddon(ADDON_PATH))
  } catch (e) {
    console.error('[volume] native audio add-on unavailable, using PowerShell:', e?.message ?? e)
    return null
  }
}

module.exports = { ADDON_PATH, bindAudioEndpoint, loadNativeAudioEndpoint }

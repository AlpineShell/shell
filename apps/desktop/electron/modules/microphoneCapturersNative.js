const { NATIVE_ADDON_PATH } = require('../nativeAddonPath')

function bindMicrophoneCapturers(addon) {
  if (typeof addon.microphoneListCapturers !== 'function') {
    throw new Error('the native add-on has no microphone exports')
  }
  return {
    kind: 'native',
    warm: async () => {},
    listCapturers: () => addon.microphoneListCapturers(),
  }
}

function loadNativeMicrophoneCapturers(requireAddon = require) {
  try {
    return bindMicrophoneCapturers(requireAddon(NATIVE_ADDON_PATH))
  } catch (e) {
    console.error('[microphone] native microphone add-on unavailable, using PowerShell:', e?.message ?? e)
    return null
  }
}

module.exports = { NATIVE_ADDON_PATH, bindMicrophoneCapturers, loadNativeMicrophoneCapturers }

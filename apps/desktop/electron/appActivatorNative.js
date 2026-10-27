const { NATIVE_ADDON_PATH } = require('./nativeAddonPath')

function bindAppActivator(addon) {
  if (typeof addon.appActivate !== 'function' || typeof addon.appActivationWarm !== 'function') {
    throw new Error('the native add-on has no app activation exports')
  }
  return {
    kind: 'native',
    warm: () => addon.appActivationWarm(),
    activatePackaged: (aumid) => addon.appActivate(aumid),
  }
}

function loadNativeAppActivator(requireAddon = require) {
  try {
    return bindAppActivator(requireAddon(NATIVE_ADDON_PATH))
  } catch (e) {
    console.error('[appActivator] native app activation unavailable, using PowerShell:', e?.message ?? e)
    return null
  }
}

module.exports = { NATIVE_ADDON_PATH, bindAppActivator, loadNativeAppActivator }

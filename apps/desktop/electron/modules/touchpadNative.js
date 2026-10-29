const { NATIVE_ADDON_PATH } = require('../nativeAddonPath')

function bindTouchpad(addon) {
  if (typeof addon.touchpadWatch !== 'function') {
    throw new Error('the native add-on has no touchpad exports')
  }

  function watch(onReport, onFailure) {
    try {
      addon.touchpadWatch((error, report) => {
        if (error) onFailure(error)
        else onReport(report)
      })
    } catch (e) {
      onFailure(e)
    }
  }

  return { kind: 'native', watch }
}

function loadNativeTouchpad(requireAddon = require) {
  try {
    return bindTouchpad(requireAddon(NATIVE_ADDON_PATH))
  } catch (e) {
    console.error('[touchpad] native touchpad add-on unavailable:', e?.message ?? e)
    return null
  }
}

module.exports = { NATIVE_ADDON_PATH, bindTouchpad, loadNativeTouchpad }

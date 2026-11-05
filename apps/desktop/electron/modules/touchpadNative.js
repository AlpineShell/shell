const { NATIVE_ADDON_PATH } = require('../nativeAddonPath')

function bindTouchpad(addon) {
  if (typeof addon.touchpadWatch !== 'function') {
    throw new Error('the native add-on has no touchpad exports')
  }

  function watch(swipeFingerCount, onFrame, onFailure) {
    try {
      addon.touchpadWatch(swipeFingerCount, (error, frame) => {
        if (error) onFailure(error)
        else onFrame(frame)
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

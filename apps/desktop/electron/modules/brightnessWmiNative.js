const { NATIVE_ADDON_PATH } = require('../nativeAddonPath')
const { clampBrightnessPercent } = require('./batterySaverPolicy')
const { indexEdidByInstancePath, isInternalVideoOutput } = require('./monitorIdentity')

const BRIGHTNESS_EXPORTS = [
  'brightnessReadCurrent',
  'brightnessReadVideoOutputTechnologies',
  'brightnessReadMonitorIdentities',
  'brightnessSetInternal',
  'brightnessSetInternalBlocking',
  'brightnessWatch',
]

function logWmiFailure(action, error) {
  console.error(`[brightness] could not ${action}:`, error?.message ?? error)
}

function settledValue(outcome, fallback) {
  return outcome.status === 'fulfilled' ? outcome.value : fallback
}

function probedInternalDisplay(technologies, brightness) {
  if (technologies.status === 'rejected') logWmiFailure('read the display connection types', technologies.reason)
  const hasInternal = isInternalVideoOutput(settledValue(technologies, []))
  if (hasInternal && brightness.status === 'rejected') logWmiFailure('read the built-in display brightness', brightness.reason)
  return { hasInternal, brightness: settledValue(brightness, null) }
}

function bindBrightnessWmi(addon) {
  if (BRIGHTNESS_EXPORTS.some(name => typeof addon[name] !== 'function')) {
    throw new Error('the native add-on has no brightness exports')
  }

  async function probeInternalAndBrightness() {
    const [technologies, brightness] = await Promise.allSettled([
      addon.brightnessReadVideoOutputTechnologies(),
      addon.brightnessReadCurrent(),
    ])
    return probedInternalDisplay(technologies, brightness)
  }

  async function readBrightness() {
    try {
      return await addon.brightnessReadCurrent()
    } catch (e) {
      logWmiFailure('read the built-in display brightness', e)
      return null
    }
  }

  async function writeBrightness(percent) {
    try {
      return { accepted: await addon.brightnessSetInternal(clampBrightnessPercent(percent)), answered: true }
    } catch (e) {
      logWmiFailure('set the built-in display brightness', e)
      return { accepted: false, answered: true }
    }
  }

  function writeBrightnessSynchronously(percent, timeoutMs) {
    return addon.brightnessSetInternalBlocking(clampBrightnessPercent(percent), timeoutMs)
  }

  async function readMonitorEdid() {
    return indexEdidByInstancePath(await addon.brightnessReadMonitorIdentities())
  }

  function watchBrightness(onBrightness, onFailure) {
    try {
      addon.brightnessWatch((error, brightness) => {
        if (error) onFailure(error)
        else onBrightness(brightness)
      })
    } catch (e) {
      onFailure(e)
    }
  }

  return {
    kind: 'native',
    probeInternalAndBrightness,
    readBrightness,
    writeBrightness,
    writeBrightnessSynchronously,
    readMonitorEdid,
    watchBrightness,
  }
}

function loadNativeBrightnessWmi(requireAddon = require) {
  try {
    return bindBrightnessWmi(requireAddon(NATIVE_ADDON_PATH))
  } catch (e) {
    console.error('[brightness] native WMI access unavailable, using PowerShell:', e?.message ?? e)
    return null
  }
}

module.exports = { NATIVE_ADDON_PATH, bindBrightnessWmi, loadNativeBrightnessWmi }

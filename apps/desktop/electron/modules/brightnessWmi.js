function prefersPowerShellBrightness(isPackaged, env) {
  return !isPackaged && env.ALPINE_BRIGHTNESS_BACKEND === 'powershell'
}

function chooseBrightnessWmi({ prefersPowerShell, loadNative, loadPowerShell }) {
  const backend = (!prefersPowerShell && loadNative()) || loadPowerShell()
  console.log(`[brightness] WMI backend: ${backend.kind}`)
  return backend
}

function loadBrightnessWmi() {
  const { app } = require('electron')
  return chooseBrightnessWmi({
    prefersPowerShell: prefersPowerShellBrightness(app.isPackaged, process.env),
    loadNative: () => require('./brightnessWmiNative').loadNativeBrightnessWmi(),
    loadPowerShell: () => require('./brightnessWmiPowerShell'),
  })
}

module.exports = { chooseBrightnessWmi, loadBrightnessWmi, prefersPowerShellBrightness }

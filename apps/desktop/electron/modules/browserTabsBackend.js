function prefersPowerShellBrowserTabs(isPackaged, env) {
  return !isPackaged && env.ALPINE_BROWSER_TABS_BACKEND === 'powershell'
}

function runningUnpackagedPowerShellPreference() {
  const { app } = require('electron')
  return prefersPowerShellBrowserTabs(app.isPackaged, process.env)
}

function createBackendChooser({ loadNative, loadPowerShell, prefersPowerShell }) {
  let backend = null
  return function chosenBackend() {
    if (backend) return backend
    backend = (!prefersPowerShell() && loadNative()) || loadPowerShell()
    console.log(`[browserTabs] browser tabs backend: ${backend.kind}`)
    return backend
  }
}

const browserTabsBackend = createBackendChooser({
  loadNative: () => require('./browserTabsNative').loadNativeBrowserTabs(),
  loadPowerShell: () => require('./browserTabsPowerShell'),
  prefersPowerShell: runningUnpackagedPowerShellPreference,
})

module.exports = { browserTabsBackend, createBackendChooser, prefersPowerShellBrowserTabs }

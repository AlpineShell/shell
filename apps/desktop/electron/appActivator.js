const FILE_EXPLORER_AUMID = 'Microsoft.Windows.Explorer'

function isPackagedAumid(appId) {
  return appId.includes('!')
}

function prefersPowerShellActivation(isPackaged, env) {
  return !isPackaged && env.ALPINE_APP_ACTIVATION_BACKEND === 'powershell'
}

function runningUnpackagedPowerShellPreference() {
  const { app } = require('electron')
  return prefersPowerShellActivation(app.isPackaged, process.env)
}

function logActivationFailure(error) {
  console.error('[appActivator]', error?.message ?? error)
}

function createAppActivator({ loadNative, loadPowerShell, prefersPowerShell, openAppsFolderItem, logFailure }) {
  let backend = null

  function activationBackend() {
    if (backend) return backend
    backend = (!prefersPowerShell() && loadNative()) || loadPowerShell()
    console.log(`[appActivator] activation backend: ${backend.kind}`)
    return backend
  }

  function runOnBackend(work) {
    Promise.resolve()
      .then(() => work(activationBackend()))
      .catch(logFailure)
  }

  function activate(appId) {
    if (!appId) return
    if (isPackagedAumid(appId)) runOnBackend((chosen) => chosen.activatePackaged(appId))
    else openAppsFolderItem(appId)
  }

  function openFileExplorer() {
    activate(FILE_EXPLORER_AUMID)
  }

  function warm() {
    runOnBackend((chosen) => chosen.warm())
  }

  return { activate, openFileExplorer, warm }
}

function openAppsFolderItemThroughShell(appId) {
  const { shellExecute } = require('./shellExecute')
  shellExecute(`shell:AppsFolder\\${appId}`, null).catch(() => {})
}

const shellAppActivator = createAppActivator({
  loadNative: () => require('./appActivatorNative').loadNativeAppActivator(),
  loadPowerShell: () => require('./appActivatorPowerShell'),
  prefersPowerShell: runningUnpackagedPowerShellPreference,
  openAppsFolderItem: openAppsFolderItemThroughShell,
  logFailure: logActivationFailure,
})

module.exports = {
  activate: shellAppActivator.activate,
  openFileExplorer: shellAppActivator.openFileExplorer,
  warm: shellAppActivator.warm,
  createAppActivator,
  isPackagedAumid,
  prefersPowerShellActivation,
}

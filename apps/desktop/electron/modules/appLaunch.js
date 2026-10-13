const { shell: electronShell } = require('electron')
const { letLaunchedAppComeForward } = require('./winFocus')
const appCatalog = require('./appCatalog')
const appManager = require('./appManager')
const appActivator = require('../appActivator')
const { shellExecute, shellExecuteElevated } = require('../shellExecute')
const pluginBackendHost = require('../pluginBackendHost')
const notice = require('./shellNotice')

const PLUGIN_UNINSTALL_TIMEOUT_MS = 300000

let shellLinkOpener = null

function launchItem(item) {
  if (!item) return { success: false }
  if (item.shellLink && shellLinkOpener) {
    shellLinkOpener(item.shellLink)
    return { success: true }
  }
  letLaunchedAppComeForward()
  if (item.lnkPath) {
    electronShell.openPath(item.lnkPath).then((err) => {
      if (err) {
        console.error('[appLaunch] openPath failed for', item.lnkPath, '-', err)
        shellExecute(item.lnkPath, null).catch(() => {})
      }
    })
  } else if (item.appId) {
    appActivator.activate(item.appId)
  }
  return { success: true }
}

function launchAdminItem(item) {
  if (!item) return { success: false }
  if (item.shellLink) return launchItem(item)
  letLaunchedAppComeForward()
  if (item.lnkPath) {
    shellExecuteElevated(item.lnkPath).catch(() => {})
  } else if (item.appId) {
    appActivator.activate(item.appId)
  }
  return { success: true }
}

async function uninstallByOwningPlugin(item) {
  const owner = item.owner
  const reply = await pluginBackendHost.sendCommand(
    owner.pluginId,
    owner.uninstallCommand,
    { file: item.lnkPath, name: item.name },
    { timeoutMs: PLUGIN_UNINSTALL_TIMEOUT_MS },
  )
  const value = reply.ok && reply.value && typeof reply.value === 'object' ? reply.value : {}
  const removed = reply.ok && value.ok !== false
  notice.show({
    id: 'launcher-uninstall',
    title: owner.pluginName,
    message: value.message || (removed ? `${item.name} was removed.` : `${item.name} could not be removed: ${reply.error || 'the plugin refused'}`),
    tone: removed ? 'success' : 'error',
    pill: removed,
    timeoutMs: removed ? 7000 : 0,
  })
  if (removed) appCatalog.scheduleRebuild()
  return { ok: removed, mode: 'plugin' }
}

async function uninstallItem(item) {
  if (!item) return { ok: false, mode: 'none' }
  if (item.owner && item.owner.uninstallCommand) return uninstallByOwningPlugin(item)
  const result = await appManager.uninstallByLaunch({ appId: item.appId, target: item.target, name: item.name })
  appCatalog.scheduleStartAppsRefresh()
  return result
}

function openItemLocation(item) {
  if (!item || !item.lnkPath) return { success: false }
  electronShell.showItemInFolder(item.lnkPath)
  return { success: true }
}

function setShellLinkOpener(fn) {
  shellLinkOpener = typeof fn === 'function' ? fn : null
}

module.exports = {
  handlers: {
    'apps/launch': (_event, id) => launchItem(appCatalog.findItem(id)),
    'apps/launch-admin': (_event, id) => launchAdminItem(appCatalog.findItem(id)),
    'apps/app-open-location': (_event, id) => openItemLocation(appCatalog.findItem(id)),
    'apps/app-uninstall': (_event, id) => uninstallItem(appCatalog.findItem(id)),
  },
  launchItem,
  launchAdminItem,
  uninstallItem,
  openItemLocation,
  setShellLinkOpener,
}

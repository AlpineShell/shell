const { localMachineKeyExists } = require('../registryWatch')
const notice = require('./shellNotice')
const power = require('./power')
const policy = require('./pendingRestartPolicy')

const FIRST_CHECK_DELAY_MS = 15000
const CHECK_INTERVAL_MS = 5 * 60 * 1000

let announcedAt = null

function isRestartPending() {
  try {
    return localMachineKeyExists(policy.WINDOWS_UPDATE_REBOOT_REQUIRED_KEY)
  } catch (e) {
    console.error('[pendingRestart] check failed:', e?.message ?? e)
    return false
  }
}

function checkPendingRestart() {
  const step = policy.pendingRestartStep(isRestartPending(), announcedAt, Date.now())
  announcedAt = step.announcedAt
  if (step.action === 'show') notice.show(policy.pendingRestartNotice(() => power.powerAction('restart')))
  else if (step.action === 'dismiss') notice.dismiss(policy.PENDING_RESTART_NOTICE_ID)
}

module.exports = {
  handlers: {},

  start() {
    setTimeout(checkPendingRestart, FIRST_CHECK_DELAY_MS)
    setInterval(checkPendingRestart, CHECK_INTERVAL_MS)
  },
}

const WINDOWS_UPDATE_REBOOT_REQUIRED_KEY = 'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate\\Auto Update\\RebootRequired'
const PENDING_RESTART_NOTICE_ID = 'windows-restart-pending'
const REMIND_AFTER_MS = 24 * 60 * 60 * 1000

function pendingRestartStep(pending, announcedAt, now) {
  if (!pending) return { action: announcedAt === null ? null : 'dismiss', announcedAt: null }
  if (announcedAt !== null && now - announcedAt < REMIND_AFTER_MS) return { action: null, announcedAt }
  return { action: 'show', announcedAt: now }
}

function pendingRestartNotice(restart) {
  return {
    id: PENDING_RESTART_NOTICE_ID,
    title: 'Restart required',
    message: 'Windows needs to restart to finish installing updates.',
    action: { label: 'Restart', run: restart },
    timeoutMs: 0,
    waitForTurn: true,
  }
}

module.exports = {
  WINDOWS_UPDATE_REBOOT_REQUIRED_KEY,
  PENDING_RESTART_NOTICE_ID,
  REMIND_AFTER_MS,
  pendingRestartStep,
  pendingRestartNotice,
}

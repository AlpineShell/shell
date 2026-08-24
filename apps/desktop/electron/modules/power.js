const { exec } = require('child_process')

function powerAction(action) {
  switch (action) {
    case 'shutdown':
      exec('shutdown /s /t 0')
      break
    case 'restart':
      exec('shutdown /r /t 0')
      break
    case 'logout':
      exec('shutdown /l')
      break
  }
}

function announceResume(broadcast) {
  const { powerMonitor } = require('electron')
  const notify = () => broadcast('system/resume')
  for (const event of ['resume', 'unlock-screen']) {
    try {
      powerMonitor.on(event, notify)
    } catch (e) {
      console.error(`[power] cannot subscribe to '${event}':`, e?.message ?? e)
    }
  }
}

module.exports = {
  handlers: {
    'system/power-action': (_event, action) => powerAction(action),
  },
  start: announceResume,
}

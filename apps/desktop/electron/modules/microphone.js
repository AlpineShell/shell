const { friendlyAppName } = require('../appNames')
const { loadMicrophoneCapturers } = require('./microphoneCapturers')
const { skippedWhileStillRunning } = require('../skippedWhileStillRunning')

const POLL_INTERVAL_MS = 3000

let capturers = null
let lastActive = false
let lastApps = ''

function microphoneCapturers() {
  if (!capturers) capturers = loadMicrophoneCapturers()
  return capturers
}

function microphoneStatusOf(capturing) {
  if (capturing.length === 0) return { active: false, apps: [] }
  const apps = [...new Set(capturing.map(({ name, path, description }) => friendlyAppName({ path, description, processName: name })))]
  return { active: true, apps }
}

async function getMicrophoneStatus() {
  try {
    return microphoneStatusOf(await microphoneCapturers().listCapturers())
  } catch {
    return { active: false, apps: [] }
  }
}

module.exports = {
  handlers: {
    'media/microphone': () => getMicrophoneStatus(),
  },

  microphoneStatusOf,

  start(broadcast) {
    Promise.resolve()
      .then(() => microphoneCapturers().warm())
      .catch((e) => console.error('[microphone] warm failed:', e?.message ?? e))

    setInterval(skippedWhileStillRunning('microphone', async () => {
      const current = await getMicrophoneStatus()
      const appsKey = current.apps.join(',')
      if (current.active !== lastActive || appsKey !== lastApps) {
        lastActive = current.active
        lastApps = appsKey
        broadcast('media/microphone-changed', current)
      }
    }), POLL_INTERVAL_MS)
  },
}

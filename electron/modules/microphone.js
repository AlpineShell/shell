const { exec } = require('child_process')
const path = require('path')
const { app } = require('electron')

let lastActive = false
let lastApps = ''

const scriptPath = app.isPackaged
  ? path.join(process.resourcesPath, 'scripts', 'microphoneStatus.ps1')
  : path.join(__dirname, '..', 'scripts', 'microphoneStatus.ps1')

function getMicrophoneStatus() {
  return new Promise((resolve) => {
    exec(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`,
      (err, stdout) => {
        if (err || !stdout) return resolve({ active: false, apps: [] })
        try {
          const parsed = JSON.parse(stdout.trim())
          resolve({
            active: !!parsed.active,
            apps: Array.isArray(parsed.apps) ? parsed.apps : parsed.apps ? [parsed.apps] : [],
          })
        } catch {
          resolve({ active: false, apps: [] })
        }
      }
    )
  })
}

module.exports = {
  handlers: {
    'media/microphone': () => getMicrophoneStatus(),
  },

  start(broadcast) {
    setInterval(async () => {
      const current = await getMicrophoneStatus()
      const appsKey = current.apps.join(',')
      if (current.active !== lastActive || appsKey !== lastApps) {
        lastActive = current.active
        lastApps = appsKey
        broadcast('media/microphone-changed', current)
      }
    }, 3000)
  },
}

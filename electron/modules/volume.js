const { exec } = require('child_process')
const path = require('path')

const SCRIPT = path.join(__dirname, '..', 'scripts', 'audio.ps1').replace(/\\/g, '/')

let lastVolume = undefined

function getVolume() {
  return new Promise((resolve) => {
    exec(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${SCRIPT}" -Action get`,
      (err, stdout, stderr) => {
        if (err) {
          console.error('[volume] get error:', err.message, stderr)
          return resolve(50)
        }
        const val = parseInt(stdout.trim(), 10)
        resolve(isNaN(val) ? 50 : val)
      }
    )
  })
}

function setVolume(value) {
  return new Promise((resolve) => {
    const clamped = Math.max(0, Math.min(100, Math.round(value)))
    exec(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${SCRIPT}" -Action set -Value ${clamped}`,
      (err, _stdout, stderr) => {
        if (err) console.error('[volume] set error:', err.message, stderr)
        resolve(clamped)
      }
    )
  })
}

module.exports = {
  handlers: {
    'system/volume-get': () => getVolume(),
    'system/volume-set': (_event, value) => setVolume(value),
  },

  start(broadcast) {
    setInterval(async () => {
      const current = await getVolume()
      if (current !== lastVolume) {
        lastVolume = current
        broadcast('system/volume-changed', current)
      }
    }, 3000)
  },
}

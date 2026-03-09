const { exec } = require('child_process')

let lastBrightness = undefined

function getBrightness() {
  return new Promise((resolve) => {
    exec(
      'powershell -NoProfile -Command "(Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness).CurrentBrightness"',
      (err, stdout) => {
        if (err) return resolve(50)
        const val = parseInt(stdout.trim(), 10)
        resolve(isNaN(val) ? 50 : val)
      }
    )
  })
}

function setBrightness(value) {
  return new Promise((resolve) => {
    const clamped = Math.max(0, Math.min(100, Math.round(value)))
    exec(
      `powershell -NoProfile -Command "(Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods).WmiSetBrightness(1, ${clamped})"`,
      () => resolve(clamped)
    )
  })
}

module.exports = {
  handlers: {
    'system/brightness-get': () => getBrightness(),
    'system/brightness-set': (_event, value) => setBrightness(value),
  },

  start(broadcast) {
    setInterval(async () => {
      const current = await getBrightness()
      if (current !== lastBrightness) {
        lastBrightness = current
        broadcast('system/brightness-changed', current)
      }
    }, 3000)
  },
}

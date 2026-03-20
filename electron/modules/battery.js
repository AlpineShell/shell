const { exec } = require('child_process')
const path = require('path')

let lastPercent = undefined
let lastCharging = undefined

const scriptPath = path.join(__dirname, '..', 'scripts', 'batteryStatus.ps1')

function getBatteryStatus() {
  return new Promise((resolve) => {
    exec(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`,
      (err, stdout) => {
        if (err || !stdout) return resolve({ percent: null, charging: false, hasBattery: false })
        try {
          const parsed = JSON.parse(stdout.trim())
          resolve({
            percent: parsed.percent ?? null,
            charging: !!parsed.charging,
            hasBattery: !!parsed.hasBattery,
          })
        } catch {
          resolve({ percent: null, charging: false, hasBattery: false })
        }
      }
    )
  })
}

module.exports = {
  handlers: {
    'system/battery': () => getBatteryStatus(),
  },

  start(broadcast) {
    setInterval(async () => {
      const current = await getBatteryStatus()
      if (current.percent !== lastPercent || current.charging !== lastCharging) {
        lastPercent = current.percent
        lastCharging = current.charging
        broadcast('system/battery-changed', current)
      }
    }, 10000)
  },
}

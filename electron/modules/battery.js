const { exec } = require('child_process')

let lastPercent = undefined
let lastCharging = undefined

const PS_CMD = 'powershell -NoProfile -Command "Get-CimInstance -ClassName Win32_Battery | Select-Object EstimatedChargeRemaining, BatteryStatus | ConvertTo-Json -Compress"'

function getBatteryStatus() {
  return new Promise((resolve) => {
    exec(PS_CMD, (err, stdout) => {
      if (err || !stdout) return resolve({ percent: null, charging: false, hasBattery: false })
      try {
        const parsed = JSON.parse(stdout.trim())
        const status = parsed.BatteryStatus ?? 0
        const percent = parsed.EstimatedChargeRemaining ?? null
        resolve({
          percent,
          charging: status === 2 || status === 6 || status === 7 || status === 8 || status === 9,
          hasBattery: true,
        })
      } catch {
        resolve({ percent: null, charging: false, hasBattery: false })
      }
    })
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
    }, 30000)
  },
}

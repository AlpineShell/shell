const { exec, execSync } = require('child_process')
const { createPersistentRunner } = require('../powershell')
const { clampBrightnessPercent } = require('./batterySaverPolicy')
const { isInternalVideoOutput, parseMonitorEdidRows } = require('./monitorIdentity')

const wmiRunner = createPersistentRunner()

const WMI_BRIGHTNESS_WRITE_ACCEPTED = 'ALPINE_BRIGHTNESS_WRITE_ACCEPTED'

const INTERNAL_PROBE_CMD =
  'powershell -NoProfile -Command "' +
  "$ErrorActionPreference='SilentlyContinue';$v='';$b='';" +
  "try{$v=((Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorConnectionParams).VideoOutputTechnology -join ',')}catch{};" +
  "try{$b=(@((Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness).CurrentBrightness)[0])}catch{};" +
  "($v + '#' + $b)" +
  '"'

const MONITOR_EDID_QUERY =
  'Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorID -ErrorAction SilentlyContinue | ' +
  "ForEach-Object { $_.InstanceName + '|' + " +
  "(-join [char[]]($_.ManufacturerName | Where-Object { $_ })) + '|' + " +
  "(-join [char[]]($_.ProductCodeID | Where-Object { $_ })) + '|' + " +
  "(-join [char[]]($_.SerialNumberID | Where-Object { $_ })) }"

function probeInternalAndBrightness() {
  return new Promise((resolve) => {
    exec(INTERNAL_PROBE_CMD, (err, stdout) => {
      if (err) return resolve({ hasInternal: false, brightness: null })
      const line = (stdout || '').trim()
      const sep = line.indexOf('#')
      const votPart = sep >= 0 ? line.slice(0, sep) : line
      const brPart = sep >= 0 ? line.slice(sep + 1) : ''
      const values = votPart.split(',').map(v => parseInt(v.trim(), 10)).filter(v => !isNaN(v))
      const brightness = parseInt(brPart.trim(), 10)
      resolve({ hasInternal: isInternalVideoOutput(values), brightness: isNaN(brightness) ? null : brightness })
    })
  })
}

async function wmiGetBrightness() {
  const result = await wmiRunner.run('(Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness).CurrentBrightness')
  const val = parseInt(result.trim(), 10)
  return isNaN(val) ? null : val
}

function wmiSetBrightnessCommand(clamped) {
  return `powershell -NoProfile -Command "try{(Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods).WmiSetBrightness(1, ${clamped}) | Out-Null; '${WMI_BRIGHTNESS_WRITE_ACCEPTED}'}catch{}"`
}

function wmiWriteWasAccepted(output) {
  return String(output ?? '').includes(WMI_BRIGHTNESS_WRITE_ACCEPTED)
}

function wmiSetBrightness(value) {
  return new Promise((resolve) => {
    exec(wmiSetBrightnessCommand(clampBrightnessPercent(value)), (err, stdout) => {
      if (err) return resolve({ accepted: false, answered: false })
      resolve({ accepted: wmiWriteWasAccepted(stdout), answered: true })
    })
  })
}

function writeInternalBrightnessSynchronously(percent, timeoutMs) {
  const output = execSync(wmiSetBrightnessCommand(clampBrightnessPercent(percent)), {
    timeout: timeoutMs,
    stdio: ['ignore', 'pipe', 'ignore'],
    windowsHide: true,
  })
  return wmiWriteWasAccepted(output)
}

async function readMonitorEdid() {
  return parseMonitorEdidRows(await wmiRunner.run(MONITOR_EDID_QUERY))
}

function watchBrightness() {}

module.exports = {
  kind: 'powershell',
  probeInternalAndBrightness,
  readBrightness: wmiGetBrightness,
  writeBrightness: wmiSetBrightness,
  writeBrightnessSynchronously: writeInternalBrightnessSynchronously,
  readMonitorEdid,
  watchBrightness,
}

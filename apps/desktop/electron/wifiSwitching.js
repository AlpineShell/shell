const { runPowerShell } = require('./powershell')

const SWITCHING_PROBE_COMMAND = [
  '$bios = $null;',
  "try { $entry = Get-CimInstance -Namespace root\\HP\\InstrumentedBIOS -ClassName HP_BIOSEnumeration -ErrorAction Stop | Where-Object { $_.Name -match '^LAN\\s*/\\s*WLAN.*Switch' } | Select-Object -First 1; if ($entry) { $bios = [string]$entry.CurrentValue } } catch { $bios = $null };",
  '$service = Get-Service LanWlanWwanSwitchingServiceUWP -ErrorAction SilentlyContinue;',
  '$status = if ($service) { [string]$service.Status } else { $null };',
  '[pscustomobject]@{ bios = $bios; service = $status } | ConvertTo-Json -Compress',
].join(' ')

const ENABLED_BIOS_VALUES = new Set(['enable', 'enabled'])

function parseSwitchingProbe(stdout) {
  try {
    const probe = JSON.parse(stdout)
    const bios = typeof probe?.bios === 'string' ? probe.bios.trim().toLowerCase() : ''
    return ENABLED_BIOS_VALUES.has(bios) && probe?.service === 'Running'
  } catch {
    return false
  }
}

async function readEthernetSwitchesWifiOff() {
  try {
    return parseSwitchingProbe(await runPowerShell(SWITCHING_PROBE_COMMAND))
  } catch {
    return false
  }
}

module.exports = { SWITCHING_PROBE_COMMAND, parseSwitchingProbe, readEthernetSwitchesWifiOff }

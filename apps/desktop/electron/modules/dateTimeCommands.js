const TIME_ZONE_AUTO_UPDATE_KEY = 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\tzautoupdate'
const TIME_SYNC_PARAMETERS_KEY = 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\W32Time\\Parameters'
const AUTO_TIME_ZONE_ON_START = 3
const AUTO_TIME_ZONE_OFF_START = 4
const NO_SYNC_TYPE = 'NoSync'
const REPORT_SUCCESS = 'exit 0'

const READ_STATE_SCRIPT = [
  '$zone = Get-TimeZone',
  '$zones = @(Get-TimeZone -ListAvailable | ForEach-Object { @{ id = $_.Id; label = $_.DisplayName } })',
  `$autoZoneStart = (Get-ItemProperty -Path '${TIME_ZONE_AUTO_UPDATE_KEY}' -Name Start -ErrorAction SilentlyContinue).Start`,
  `$syncType = (Get-ItemProperty -Path '${TIME_SYNC_PARAMETERS_KEY}' -Name Type -ErrorAction SilentlyContinue).Type`,
  '@{ timeZoneId = $zone.Id; timeZones = $zones; autoTimeZoneStart = $autoZoneStart; timeSyncType = $syncType } | ConvertTo-Json -Compress -Depth 3',
].join('; ')

const EMPTY_STATE = Object.freeze({ timeZoneId: null, timeZones: [], autoTimeZone: null, autoTime: null })

function isTimeZoneOption(value) {
  return value !== null && typeof value === 'object' && typeof value.id === 'string' && value.id.length > 0 && typeof value.label === 'string'
}

function autoTimeZoneFromStart(start) {
  if (start === AUTO_TIME_ZONE_ON_START) return true
  if (start === AUTO_TIME_ZONE_OFF_START) return false
  return null
}

function autoTimeFromSyncType(type) {
  return typeof type === 'string' && type.length > 0 ? type !== NO_SYNC_TYPE : null
}

function parseDateTimeState(output) {
  let data
  try {
    data = JSON.parse(output)
  } catch {
    return EMPTY_STATE
  }
  if (!data || typeof data !== 'object') return EMPTY_STATE
  const timeZones = Array.isArray(data.timeZones) ? data.timeZones.filter(isTimeZoneOption).map(({ id, label }) => ({ id, label })) : []
  return {
    timeZoneId: typeof data.timeZoneId === 'string' ? data.timeZoneId : null,
    timeZones,
    autoTimeZone: autoTimeZoneFromStart(data.autoTimeZoneStart),
    autoTime: autoTimeFromSyncType(data.timeSyncType),
  }
}

function isOfferedTimeZone(state, id) {
  return typeof id === 'string' && state.timeZones.some((zone) => zone.id === id)
}

function autoTimeZoneScript(on) {
  const start = on ? AUTO_TIME_ZONE_ON_START : AUTO_TIME_ZONE_OFF_START
  const lines = [
    "$ErrorActionPreference = 'Stop'",
    `Set-ItemProperty -Path '${TIME_ZONE_AUTO_UPDATE_KEY}' -Name Start -Value ${start} -Type DWord`,
  ]
  if (on) lines.push('Start-Service tzautoupdate -ErrorAction SilentlyContinue')
  lines.push(REPORT_SUCCESS)
  return lines.join('\r\n')
}

function autoTimeScript(on) {
  const syncType = on ? "$(if ((Get-CimInstance Win32_ComputerSystem).PartOfDomain) { 'NT5DS' } else { 'NTP' })" : `'${NO_SYNC_TYPE}'`
  const lines = [
    "$ErrorActionPreference = 'Stop'",
    `Set-ItemProperty -Path '${TIME_SYNC_PARAMETERS_KEY}' -Name Type -Value ${syncType}`,
  ]
  if (on) lines.push('Start-Service w32time', 'w32tm /config /update | Out-Null', 'w32tm /resync /nowait | Out-Null')
  else lines.push("if ((Get-Service w32time).Status -eq 'Running') { w32tm /config /update | Out-Null }")
  lines.push(REPORT_SUCCESS)
  return lines.join('\r\n')
}

function syncNowScript() {
  return [
    "$ErrorActionPreference = 'Stop'",
    'Start-Service w32time',
    'w32tm /resync /force | Out-Null',
    'if ($LASTEXITCODE -ne 0) { Start-Sleep -Seconds 2; w32tm /resync /force | Out-Null }',
    'exit $LASTEXITCODE',
  ].join('\r\n')
}

module.exports = {
  READ_STATE_SCRIPT,
  EMPTY_STATE,
  parseDateTimeState,
  isOfferedTimeZone,
  autoTimeZoneScript,
  autoTimeScript,
  syncNowScript,
}

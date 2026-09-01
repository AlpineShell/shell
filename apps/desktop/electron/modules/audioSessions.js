const path = require('path')
const fs = require('fs')
const { createPersistentRunner } = require('../powershell')

const TYPE_DEFINITION_END = "\n'@"
const QUERY = "$sessionProcessIds = [AlpineShell.Audio.AudioSessionScanner]::GetActiveAudioProcessIds(); if ($sessionProcessIds.Count -eq 0) { '[]' } else { ConvertTo-Json -Compress -InputObject @($sessionProcessIds | ForEach-Object { [int]$_ }) }"

const ALWAYS_EXCLUDED_IMAGE_NAMES = new Set(['audiodg', 'audiosrv', 'audioendpointbuilder'])
const NEVER_A_SESSION_HOLDER = new Set([0, 4])

let runner = null

function scriptPath() {
  const { app } = require('electron')
  return app.isPackaged
    ? path.join(process.resourcesPath, 'scripts', 'audioSessions.ps1')
    : path.join(__dirname, '..', 'scripts', 'audioSessions.ps1')
}

function loadTypeDefinition() {
  try {
    const script = fs.readFileSync(scriptPath(), 'utf8')
    const end = script.indexOf(TYPE_DEFINITION_END)
    return end > 0 ? script.substring(0, end + TYPE_DEFINITION_END.length) : script
  } catch (e) {
    console.error('[audioSessions] cannot read scanner script:', e?.message ?? e)
    return ''
  }
}

function getRunner() {
  if (!runner) runner = createPersistentRunner(undefined, undefined, loadTypeDefinition)
  return runner
}

function parseProcessIds(raw) {
  if (!raw) return []
  let parsed = null
  try {
    parsed = JSON.parse(raw)
  } catch (_) {
    return []
  }
  const list = Array.isArray(parsed) ? parsed : [parsed]
  return list
    .map((value) => Number(value))
    .filter((pid) => Number.isInteger(pid) && pid > 0 && !NEVER_A_SESSION_HOLDER.has(pid))
}

async function readActiveAudioPids() {
  let raw = ''
  try {
    raw = await getRunner().run(QUERY)
  } catch (e) {
    console.error('[audioSessions] scan failed:', e?.message ?? e)
    return null
  }
  if (typeof raw !== 'string' || raw.trim().length === 0) return null
  return parseProcessIds(raw)
}

function warm() {
  getRunner().warm()
}

function dispose() {
  if (!runner) return
  runner.dispose()
  runner = null
}

module.exports = {
  ALWAYS_EXCLUDED_IMAGE_NAMES,
  NEVER_A_SESSION_HOLDER,
  parseProcessIds,
  readActiveAudioPids,
  warm,
  dispose,
}

const { app } = require('electron')
const path = require('path')
const fs = require('fs')
const { createPersistentRunner } = require('../powershell')

let lastActive = false
let lastApps = ''

const SCRIPT_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'scripts', 'microphoneStatus.ps1')
  : path.join(__dirname, '..', 'scripts', 'microphoneStatus.ps1')
const QUERY = `$r=[MicDetect]::GetActiveCapturers(); if($r.Count -eq 0){'{}'}else{@{active=$true;apps=$r}|ConvertTo-Json -Compress}`

function loadTypeDefinition() {
  const script = fs.readFileSync(SCRIPT_PATH, 'utf8')
  const queryIdx = script.indexOf('\n$results')
  return queryIdx > 0 ? script.substring(0, queryIdx) : script
}

const runner = createPersistentRunner(undefined, undefined, loadTypeDefinition)

async function getMicrophoneStatus() {
  try {
    const result = await runner.run(QUERY)
    if (!result) return { active: false, apps: [] }
    const parsed = JSON.parse(result)
    return {
      active: !!parsed.active,
      apps: Array.isArray(parsed.apps) ? parsed.apps : parsed.apps ? [parsed.apps] : [],
    }
  } catch {
    return { active: false, apps: [] }
  }
}

module.exports = {
  handlers: {
    'media/microphone': () => getMicrophoneStatus(),
  },

  start(broadcast) {
    runner.warm()

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

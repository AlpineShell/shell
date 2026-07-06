const { app } = require('electron')
const path = require('path')
const fs = require('fs')
const { createPersistentRunner } = require('../powershell')
const { friendlyAppName } = require('../appNames')

let lastActive = false
let lastApps = ''

const SCRIPT_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'scripts', 'microphoneStatus.ps1')
  : path.join(__dirname, '..', 'scripts', 'microphoneStatus.ps1')
const QUERY = `$names=[MicDetect]::GetActiveCapturers(); if($names.Count -eq 0){'{}'}else{$apps=@(foreach($n in $names){$fp=$null;$fd=$null;try{$mp=Get-Process -Name $n -ErrorAction Stop | Select-Object -First 1;$fp=$mp.MainModule.FileName;$fd=$mp.MainModule.FileVersionInfo.FileDescription;if(-not $fd){$fd=$mp.MainModule.FileVersionInfo.ProductName}}catch{};[PSCustomObject]@{name=$n;path=$fp;desc=$fd}});@{active=$true;apps=$apps} | ConvertTo-Json -Compress}`

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
    const rawApps = Array.isArray(parsed.apps) ? parsed.apps : parsed.apps ? [parsed.apps] : []
    const apps = [...new Set(rawApps.map((a) => friendlyAppName({ path: a.path, description: a.desc, processName: a.name })))]
    return { active: !!parsed.active, apps }
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

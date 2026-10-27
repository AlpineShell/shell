const path = require('path')
const fs = require('fs')
const { createPersistentRunner } = require('../powershell')

const QUERY = `$names=[MicDetect]::GetActiveCapturers(); if($names.Count -eq 0){'{}'}else{$apps=@(foreach($n in $names){$fp=$null;$fd=$null;try{$mp=Get-Process -Name $n -ErrorAction Stop | Select-Object -First 1;$fp=$mp.MainModule.FileName;$fd=$mp.MainModule.FileVersionInfo.FileDescription;if(-not $fd){$fd=$mp.MainModule.FileVersionInfo.ProductName}}catch{};[PSCustomObject]@{name=$n;path=$fp;desc=$fd}});@{active=$true;apps=$apps} | ConvertTo-Json -Compress}`

function microphoneScriptPath() {
  const { app } = require('electron')
  return app.isPackaged
    ? path.join(process.resourcesPath, 'scripts', 'microphoneStatus.ps1')
    : path.join(__dirname, '..', 'scripts', 'microphoneStatus.ps1')
}

function loadTypeDefinition() {
  const script = fs.readFileSync(microphoneScriptPath(), 'utf8')
  const queryIdx = script.indexOf('\n$results')
  return queryIdx > 0 ? script.substring(0, queryIdx) : script
}

const runner = createPersistentRunner(undefined, undefined, loadTypeDefinition)

function capturersOf(parsed) {
  const rawApps = Array.isArray(parsed.apps) ? parsed.apps : parsed.apps ? [parsed.apps] : []
  return rawApps.map((a) => ({ name: a.name, path: a.path ?? null, description: a.desc ?? null }))
}

async function listCapturers() {
  const result = await runner.run(QUERY)
  if (!result) return []
  return capturersOf(JSON.parse(result))
}

module.exports = {
  kind: 'powershell',
  warm: () => runner.warm(),
  listCapturers,
}

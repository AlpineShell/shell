const { spawn } = require('child_process')
const { app } = require('electron')
const path = require('path')
const fs = require('fs')

let lastActive = false
let lastApps = ''

const SCRIPT_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'scripts', 'microphoneStatus.ps1')
  : path.join(__dirname, '..', 'scripts', 'microphoneStatus.ps1')
const DELIM = '__MIC_DONE__'
const QUERY = `$r=[MicDetect]::GetActiveCapturers(); if($r.Count -eq 0){'{}'}else{@{active=$true;apps=$r}|ConvertTo-Json -Compress}`

let ps = null
let psReady = null
let pendingResolve = null
let outputBuf = ''
let commandQueue = []
let busy = false

function initPS() {
  if (psReady) return psReady
  psReady = new Promise((resolveInit) => {
    ps = spawn('powershell', [
      '-NoProfile', '-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', '-'
    ], { stdio: ['pipe', 'pipe', 'ignore'] })

    ps.stdout.on('data', (chunk) => {
      outputBuf += chunk.toString()
      const idx = outputBuf.indexOf(DELIM)
      if (idx !== -1) {
        const result = outputBuf.substring(0, idx).trim()
        outputBuf = outputBuf.substring(idx + DELIM.length).replace(/^\r?\n/, '')
        if (pendingResolve) {
          const r = pendingResolve
          pendingResolve = null
          r(result)
        }
      }
    })

    ps.on('exit', () => {
      console.error('[microphone] PowerShell process exited unexpectedly')
      ps = null
      psReady = null
      busy = false
      if (pendingResolve) { pendingResolve(''); pendingResolve = null }
      for (const { resolve } of commandQueue) resolve('')
      commandQueue = []
    })

    const script = fs.readFileSync(SCRIPT_PATH, 'utf8')
    const queryIdx = script.indexOf('\n$results')
    const typeDef = queryIdx > 0 ? script.substring(0, queryIdx) : script
    pendingResolve = () => { resolveInit(); processNext() }
    ps.stdin.write(`$OutputEncoding = [System.Text.Encoding]::UTF8\n${typeDef}\nWrite-Output '${DELIM}'\n`)
  })
  return psReady
}

function processNext() {
  if (commandQueue.length === 0) { busy = false; return }
  busy = true
  const { cmd, resolve } = commandQueue.shift()
  pendingResolve = (result) => {
    resolve(result)
    processNext()
  }
  ps.stdin.write(`${cmd}\nWrite-Output '${DELIM}'\n`)
}

async function runCmd(cmd) {
  await initPS()
  return new Promise((resolve) => {
    commandQueue.push({ cmd, resolve })
    if (!busy) processNext()
  })
}

async function getMicrophoneStatus() {
  try {
    const result = await runCmd(QUERY)
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
    initPS()

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

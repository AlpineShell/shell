const { spawn } = require('child_process')
const { app } = require('electron')
const path = require('path')
const fs = require('fs')

const SCRIPT_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'scripts', 'audio.ps1')
  : path.join(__dirname, '..', 'scripts', 'audio.ps1')
const DELIM = '__AUDIO_DONE__'

let ps = null
let psReady = null
let pendingResolve = null
let outputBuf = ''
let commandQueue = []
let busy = false
let lastSetTime = 0
let lastVolume = undefined
let lastMute = undefined

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
      console.error('[volume] PowerShell process exited unexpectedly')
      ps = null
      psReady = null
      busy = false
      if (pendingResolve) { pendingResolve(''); pendingResolve = null }
      for (const { resolve } of commandQueue) resolve('')
      commandQueue = []
    })

    const script = fs.readFileSync(SCRIPT_PATH, 'utf8')
    const switchIdx = script.indexOf('\nswitch')
    const typeDef = switchIdx > 0 ? script.substring(0, switchIdx) : script
    pendingResolve = () => { resolveInit(); processNext() }
    ps.stdin.write(`${typeDef}\nWrite-Output '${DELIM}'\n`)
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

async function getVolume() {
  try {
    const result = await runCmd('[math]::Round([Audio]::GetVolume() * 100)')
    const val = parseInt(result, 10)
    return isNaN(val) ? 50 : val
  } catch {
    return 50
  }
}

async function setVolume(value) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)))
  lastSetTime = Date.now()
  commandQueue = commandQueue.filter(c => !c.cmd.startsWith('[Audio]::SetVolume'))
  await runCmd(`[Audio]::SetVolume(${clamped} / 100.0)`)
  return clamped
}

async function getMute() {
  try {
    const result = await runCmd('[Audio]::GetMute()')
    return result.trim() === 'True'
  } catch {
    return false
  }
}

async function setMute(muted) {
  lastSetTime = Date.now()
  commandQueue = commandQueue.filter(c => !c.cmd.startsWith('[Audio]::SetMute'))
  await runCmd(`[Audio]::SetMute($${muted ? 'true' : 'false'})`)
  return muted
}

let peakListeners = 0
let peakInterval = null

async function getPeak() {
  try {
    const result = await runCmd('[Math]::Round([Audio]::GetPeak(), 3)')
    return parseFloat(result) || 0
  } catch {
    return 0
  }
}

function startPeakMeter(broadcast) {
  if (peakInterval) return
  peakInterval = setInterval(async () => {
    if (peakListeners <= 0) return
    const peak = await getPeak()
    broadcast('system/audio-peak', peak)
  }, 66)
}

function stopPeakMeter() {
  if (peakInterval) {
    clearInterval(peakInterval)
    peakInterval = null
  }
}

module.exports = {
  handlers: {
    'system/volume-get': () => getVolume(),
    'system/volume-set': (_event, value) => setVolume(value),
    'system/mute-get': () => getMute(),
    'system/mute-set': (_event, muted) => setMute(muted),
    'system/peak-subscribe': () => { peakListeners++; return true },
    'system/peak-unsubscribe': () => { peakListeners = Math.max(0, peakListeners - 1); return true },
  },

  start(broadcast) {
    initPS()
    startPeakMeter(broadcast)

    setInterval(async () => {
      if (Date.now() - lastSetTime < 1500) return
      const current = await getVolume()
      if (current !== lastVolume) {
        lastVolume = current
        broadcast('system/volume-changed', current)
      }
      const currentMute = await getMute()
      if (currentMute !== lastMute) {
        lastMute = currentMute
        broadcast('system/mute-changed', currentMute)
      }
    }, 1000)
  },
}

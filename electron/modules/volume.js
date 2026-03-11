const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')

const SCRIPT_PATH = path.join(__dirname, '..', 'scripts', 'audio.ps1')
const DELIM = '__AUDIO_DONE__'

// -- Persistent PowerShell process (compiles C# once, then instant commands) --
let ps = null
let psReady = null
let pendingResolve = null
let outputBuf = ''
let commandQueue = []
let busy = false
let lastSetTime = 0
let lastVolume = undefined

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

    ps.on('exit', () => { ps = null; psReady = null; busy = false })

    // Compile the C# Audio class once at startup
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
  // Drop any queued set commands — only the latest value matters
  commandQueue = commandQueue.filter(c => !c.cmd.startsWith('[Audio]::SetVolume'))
  await runCmd(`[Audio]::SetVolume(${clamped} / 100.0)`)
  return clamped
}

module.exports = {
  handlers: {
    'system/volume-get': () => getVolume(),
    'system/volume-set': (_event, value) => setVolume(value),
  },

  start(broadcast) {
    // Pre-warm the persistent PowerShell process
    initPS()

    setInterval(async () => {
      // Skip poll briefly after a set to avoid stale-value snap-back
      if (Date.now() - lastSetTime < 1500) return
      const current = await getVolume()
      if (current !== lastVolume) {
        lastVolume = current
        broadcast('system/volume-changed', current)
      }
    }, 1000)
  },
}

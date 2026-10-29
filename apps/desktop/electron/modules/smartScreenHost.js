const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const readline = require('readline')
const { execFile, spawn } = require('child_process')
const protocol = require('./smartScreenHostProtocol')

const CSC_PATH = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe'
const SOURCE_NAME = 'smartScreenHost.cs'
const EXE_NAME_PATTERN = /^AlpineSmartScreenHost-[0-9a-f]+\.exe$/i
const RESTART_LIMIT = 3
const RESTART_DELAY_MS = 5000

let child = null
let running = false
let restarts = 0
let promptListener = null

function electronApp() {
  return require('electron').app
}

function sourcePath() {
  if (electronApp().isPackaged) return path.join(process.resourcesPath, 'scripts', SOURCE_NAME)
  return path.join(__dirname, '..', 'scripts', SOURCE_NAME)
}

function hostDir() {
  return path.join(electronApp().getPath('userData'), 'smartscreen-host')
}

function exePathForSource(source) {
  const hash = crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex').slice(0, 12)
  return path.join(hostDir(), `AlpineSmartScreenHost-${hash}.exe`)
}

function pruneStaleExes(keepExePath) {
  try {
    for (const name of fs.readdirSync(hostDir())) {
      const full = path.join(hostDir(), name)
      if (EXE_NAME_PATTERN.test(name) && full !== keepExePath) {
        try { fs.unlinkSync(full) } catch {}
      }
    }
  } catch {}
}

function compile(source, exePath) {
  return new Promise((resolve) => {
    try { fs.mkdirSync(hostDir(), { recursive: true }) } catch {}
    execFile(CSC_PATH, ['/nologo', '/optimize', '/target:exe', `/out:${exePath}`, source], { windowsHide: true }, (err) => {
      if (err) console.error('[smartScreenHost] compile failed:', err.message)
      resolve(fs.existsSync(exePath))
    })
  })
}

async function ensureHostExe() {
  const source = sourcePath()
  if (!fs.existsSync(source) || !fs.existsSync(CSC_PATH)) return null
  let exePath
  try {
    exePath = exePathForSource(source)
  } catch (e) {
    console.error('[smartScreenHost] could not hash the host source:', e.message)
    return null
  }
  if (!fs.existsSync(exePath) && !(await compile(source, exePath))) return null
  pruneStaleExes(exePath)
  return exePath
}

function handleLine(line) {
  const message = protocol.parseHostLine(line)
  if (!message) return
  if (message.type === 'ready') {
    restarts = 0
    return
  }
  if (message.type === 'failed') {
    console.error('[smartScreenHost] could not stand in for the immersive shell, hr', message.code)
    return
  }
  if (message.type === 'prompt' && promptListener) {
    try { promptListener(message) } catch (e) { console.error('[smartScreenHost] prompt listener failed:', e.message) }
  }
}

function launch(exePath) {
  if (!running) return
  let started
  try {
    started = spawn(exePath, [], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
  } catch (e) {
    console.error('[smartScreenHost] could not start the host:', e.message)
    return
  }
  child = started
  readline.createInterface({ input: started.stdout }).on('line', handleLine)
  readline.createInterface({ input: started.stderr }).on('line', (line) => console.error('[smartScreenHost]', line))
  started.stdin.on('error', () => {})
  started.on('error', (e) => console.error('[smartScreenHost] host error:', e.message))
  started.on('exit', (code) => {
    if (child === started) child = null
    if (!running) return
    if (restarts >= RESTART_LIMIT) {
      console.error('[smartScreenHost] host keeps exiting, giving up; last exit code', code)
      return
    }
    restarts++
    setTimeout(() => launch(exePath), RESTART_DELAY_MS)
  })
}

async function start() {
  if (running) return
  running = true
  const exePath = await ensureHostExe()
  if (!exePath) {
    console.error('[smartScreenHost] host unavailable, SmartScreen prompts stay cancelled')
    return
  }
  launch(exePath)
}

function stop() {
  running = false
  const stopping = child
  child = null
  if (!stopping) return
  try { stopping.stdin.end() } catch {}
}

function answer(id, userAction) {
  const line = protocol.answerLine(id, userAction)
  if (!line || !child) return false
  try {
    child.stdin.write(line)
    return true
  } catch (e) {
    console.error('[smartScreenHost] could not send the answer:', e.message)
    return false
  }
}

function onPrompt(listener) {
  promptListener = typeof listener === 'function' ? listener : null
}

module.exports = { start, stop, answer, onPrompt }

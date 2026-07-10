const { spawn, exec } = require('child_process')
const http = require('http')
const fs = require('fs')
const path = require('path')
const electronPath = require('electron')
const projectRoot = path.join(__dirname, '..')

const ALPINE = `
   █████╗ ██╗     ██████╗ ██╗███╗   ██╗███████╗
  ██╔══██╗██║     ██╔══██╗██║████╗  ██║██╔════╝
  ███████║██║     ██████╔╝██║██╔██╗ ██║█████╗
  ██╔══██║██║     ██╔═══╝ ██║██║╚██╗██║██╔══╝
  ██║  ██║███████╗██║     ██║██║ ╚████║███████╗
  ╚═╝  ╚═╝╚══════╝╚═╝     ╚═╝╚═╝  ╚═══╝╚══════╝
`

const c = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
  magenta: '\x1b[35m',
}

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

function status(label, msg, color = c.cyan) {
  process.stdout.write(`${c.dim}[${color}${label}${c.reset}${c.dim}]${c.reset} ${msg}\n`)
}

let activeGroup = null

function stepGroup(title) {
  const interactive = Boolean(process.stdout.isTTY)
  const start = Date.now()
  const tasks = []
  let frame = 0
  let lines = 0
  let closed = false

  const paint = () => {
    if (!interactive || closed) return
    if (lines) process.stdout.write(`\x1b[${lines}A`)
    let out = `${c.cyan}${c.bold}❯${c.reset} ${c.bold}${title}${c.reset}\x1b[K\n`
    for (const t of tasks) {
      const icon =
        t.state === 'run' ? `${c.cyan}${SPINNER[frame]}${c.reset}` :
        t.state === 'ok' ? `${c.green}✓${c.reset}` :
        `${c.red}✗${c.reset}`
      const label = t.state === 'ok' ? `${c.dim}${t.label}${c.reset}` : t.label
      const detail = t.detail ? ` ${c.dim}${t.detail}${c.reset}` : ''
      out += `  ${icon} ${label}${detail}\x1b[K\n`
    }
    process.stdout.write(out)
    lines = 1 + tasks.length
  }

  const elapsed = () => `${c.dim}(${((Date.now() - start) / 1000).toFixed(1)}s)${c.reset}`

  const finish = (icon, summary) => {
    closed = true
    if (timer) clearInterval(timer)
    activeGroup = null
    if (interactive) {
      if (lines) process.stdout.write(`\x1b[${lines}A`)
      process.stdout.write(`${c.dim}[${icon}${c.dim}]${c.reset} ${summary} ${elapsed()}\x1b[K\n\x1b[J`)
    } else {
      process.stdout.write(`${c.dim}[${icon}${c.dim}]${c.reset} ${summary} ${elapsed()}\n`)
    }
  }

  const api = {
    task(label) {
      const t = { label, state: 'run', detail: '' }
      tasks.push(t)
      paint()
      const settle = (state, detail) => {
        t.state = state
        if (detail) t.detail = detail
        if (interactive) {
          paint()
        } else {
          const icon = state === 'ok' ? `${c.green}✓${c.reset}` : `${c.red}✗${c.reset}`
          process.stdout.write(`  ${icon} ${t.label}${t.detail ? ` ${c.dim}${t.detail}${c.reset}` : ''}\n`)
        }
      }
      return {
        done: (detail) => settle('ok', detail),
        fail: (detail) => settle('fail', detail),
      }
    },
    collapse(summary) {
      finish(`${c.green}✓${c.reset}`, summary || title)
    },
    fail(summary) {
      closed = true
      if (timer) clearInterval(timer)
      activeGroup = null
      process.stdout.write(`${c.dim}[${c.red}✗${c.reset}${c.dim}]${c.reset} ${summary || title} ${elapsed()}\n`)
    },
    abort() {
      closed = true
      if (timer) clearInterval(timer)
      activeGroup = null
    },
  }

  const timer = interactive ? setInterval(() => { frame = (frame + 1) % SPINNER.length; paint() }, 80) : null
  if (interactive) paint()
  else process.stdout.write(`${c.cyan}${c.bold}❯${c.reset} ${c.bold}${title}${c.reset}\n`)
  activeGroup = api
  return api
}

function captureConsoleLog(fn) {
  const captured = []
  const original = console.log
  console.log = (...args) => captured.push(args.join(' '))
  try {
    fn()
  } finally {
    console.log = original
  }
  return captured
}

function killImage(image) {
  return new Promise((resolve) => {
    exec(`taskkill /F /IM "${image}"`, () => resolve())
  })
}

function startExplorer() {
  try {
    spawn('explorer.exe', [], { detached: true, stdio: 'ignore', windowsHide: false }).unref()
  } catch {}
}

function parseShellCommand(value) {
  const trimmed = value.trim()
  if (trimmed.startsWith('"')) {
    const end = trimmed.indexOf('"', 1)
    const exe = trimmed.slice(1, end > 0 ? end : trimmed.length)
    const rest = end > 0 ? trimmed.slice(end + 1).trim() : ''
    return { exe, args: parseArgs(rest) }
  }
  return { exe: trimmed, args: [] }
}

function parseArgs(value) {
  const args = []
  const re = /"([^"]*)"|(\S+)/g
  let match
  while ((match = re.exec(value))) args.push(match[1] !== undefined ? match[1] : match[2])
  return args
}

function getRegisteredShell() {
  return new Promise((resolve) => {
    exec(
      'reg query "HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon" /v Shell',
      { windowsHide: true },
      (err, stdout) => {
        if (err || !stdout) return resolve(null)
        const match = stdout.match(/Shell\s+REG_(?:SZ|EXPAND_SZ)\s+(.+)/)
        const value = match ? match[1].trim() : null
        if (!value || /explorer\.exe/i.test(value)) return resolve(null)
        resolve(parseShellCommand(value))
      }
    )
  })
}

function restoreShell() {
  if (userShell) {
    try {
      spawn(userShell.exe, userShell.args, { detached: true, stdio: 'ignore', windowsHide: false }).unref()
      return
    } catch {}
  }
  startExplorer()
}

function listeningPidsOnPort(port) {
  return new Promise((resolve) => {
    exec('netstat -ano', (err, stdout) => {
      const pids = new Set()
      if (!err && stdout) {
        for (const line of stdout.split('\n')) {
          const parts = line.trim().split(/\s+/)
          if (parts.length < 5 || parts[0] !== 'TCP') continue
          const [, local, , state, pid] = parts
          if (state === 'LISTENING' && local.endsWith(`:${port}`) && /^\d+$/.test(pid) && pid !== '0') {
            pids.add(pid)
          }
        }
      }
      resolve([...pids])
    })
  })
}

async function freePort(port) {
  for (let attempt = 0; attempt < 15; attempt++) {
    const pids = await listeningPidsOnPort(port)
    if (pids.length === 0) return
    await Promise.all(pids.map((pid) => new Promise((res) => exec(`taskkill /F /PID ${pid}`, () => res()))))
    await new Promise((res) => setTimeout(res, 100))
  }
}

function waitForPort(port) {
  return new Promise((resolve) => {
    const tryConnect = () => {
      const req = http.get(`http://127.0.0.1:${port}`, () => {
        req.destroy()
        resolve()
      })
      req.on('error', () => setTimeout(tryConnect, 200))
    }
    tryConnect()
  })
}

function spawnVite() {
  const viteBin = path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js')
  if (fs.existsSync(viteBin)) {
    return spawn(process.execPath, [viteBin], { cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe'] })
  }
  return spawn('npm', ['run', 'dev'], { cwd: projectRoot, shell: true, stdio: ['ignore', 'pipe', 'pipe'] })
}

const VITE_BANNER_NOISE = /VITE|ready in|Local:|Network:|plugin-react/
const ELECTRON_STDERR_NOISE = /DevTools listening|disk_cache|gpu_disk_cache|Unable to move the cache|Gpu Cache Creation failed|Autofill\.enable|CoInitialize|SharedImageManager|dxgi/i

let viteProc = null
let electronProc = null
let exiting = false
let userShell = null
let viteLive = false
const viteBuffer = []

function writeViteLine(line, isError) {
  const tag = `${c.dim}[${isError ? c.red : c.magenta}vite${c.reset}${c.dim}]${c.reset}`
  const formatted = `${tag} ${line}\n`
  if (viteLive) process.stdout.write(formatted)
  else viteBuffer.push(formatted)
}

function flushViteBuffer() {
  while (viteBuffer.length) process.stdout.write(viteBuffer.shift())
}

function syncWrite(text) {
  try { fs.writeSync(1, text) } catch {}
}

function cleanup() {
  if (exiting) return
  exiting = true

  if (activeGroup) activeGroup.abort()

  restoreShell()

  syncWrite(`\n${c.dim}[${c.yellow}shutdown${c.reset}${c.dim}]${c.reset} Stopping services...\n`)
  syncWrite(`${c.dim}[${c.yellow}shutdown${c.reset}${c.dim}]${c.reset} ${userShell ? 'Restoring Alpine Shell...' : 'Restoring explorer.exe...'}\n`)

  if (electronProc?.pid) {
    try { spawn('taskkill', ['/F', '/T', '/PID', String(electronProc.pid)], { stdio: 'ignore', windowsHide: true, detached: true }).unref() } catch {}
  }
  if (viteProc?.pid) {
    try { spawn('taskkill', ['/F', '/T', '/PID', String(viteProc.pid)], { stdio: 'ignore', windowsHide: true, detached: true }).unref() } catch {}
  }
  if (electronProc) try { electronProc.kill() } catch {}
  if (viteProc) try { viteProc.kill() } catch {}

  syncWrite(`${c.dim}[${c.yellow}shutdown${c.reset}${c.dim}]${c.reset} ${c.green}Goodbye${c.reset}\n`)

  if (process.stdin.isTTY) {
    try { process.stdin.setRawMode(false) } catch {}
  }
  setTimeout(() => process.exit(0), 200)
}

if (process.stdin.isTTY) {
  try {
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.on('data', (data) => {
      if (data[0] === 0x03) cleanup()
    })
  } catch {}
}

process.on('SIGINT', cleanup)
process.on('SIGTERM', cleanup)
process.on('SIGBREAK', cleanup)
process.on('exit', () => {
  if (!exiting) restoreShell()
})

async function main() {
  console.clear()
  process.stdout.write(`${c.cyan}${c.bold}${ALPINE}${c.reset}`)
  process.stdout.write(`${c.gray}  ─── Windows Desktop Shell ───${c.reset}\n\n`)

  const prep = stepGroup('Preparing environment')

  const credTask = prep.task('Google credentials')
  try {
    const logged = captureConsoleLog(() => require('./generateGoogleCredentials').run())
    credTask.done((logged[0] || '').replace(/^\[credentials\]\s*/, ''))
  } catch (e) {
    credTask.fail(`skipped — ${e.message}`)
  }

  const shellTask = prep.task('Detecting registered shell')
  userShell = await getRegisteredShell()
  shellTask.done(userShell ? 'Alpine Shell' : 'explorer.exe')

  const portTask = prep.task('Freeing port 5173')
  await freePort(5173)
  portTask.done()

  prep.collapse('Environment ready')

  const frontend = stepGroup('Starting frontend — current shell keeps running')
  const viteTask = frontend.task('Vite dev server')

  viteProc = spawnVite()
  viteProc.stdout.on('data', (data) => {
    if (exiting) return
    const lines = data.toString().split('\n').filter((l) => l.trim() && !VITE_BANNER_NOISE.test(l))
    for (const line of lines) writeViteLine(line.trim(), false)
  })
  viteProc.stderr.on('data', (data) => {
    if (exiting) return
    const lines = data.toString().split('\n').filter((l) => l.trim())
    for (const line of lines) writeViteLine(line.trim(), true)
  })
  viteProc.on('close', (code) => {
    if (exiting) return
    if (!viteLive) {
      viteTask.fail(`exited with code ${code}`)
      frontend.fail('Frontend failed to start')
      flushViteBuffer()
      cleanup()
    }
  })

  await waitForPort(5173)
  if (exiting) return
  viteTask.done('http://localhost:5173')
  frontend.collapse('Frontend ready — http://localhost:5173')

  const swap = stepGroup('Swapping shell')
  if (userShell) {
    const alpineTask = swap.task('Stopping Alpine Shell')
    await killImage('Alpine Shell.exe')
    alpineTask.done()
  }
  const explorerTask = swap.task('Stopping explorer.exe')
  await killImage('explorer.exe')
  explorerTask.done()

  const electronTask = swap.task('Starting Electron backend')
  electronProc = spawn(electronPath, ['.'], {
    cwd: projectRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: false,
  })
  electronTask.done()
  swap.collapse('Shell swapped to dev')

  console.log(`\n${c.gray}  ─── Logs ───${c.reset}\n`)
  viteLive = true
  flushViteBuffer()

  electronProc.stdout.on('data', (data) => {
    if (exiting) return
    const lines = data.toString().split('\n').filter((l) => l.trim())
    for (const line of lines) {
      const trimmed = line.trim()
      const m = trimmed.match(/^\[([^\]]+)\]\s*(.*)$/)
      if (m) {
        process.stdout.write(`${c.dim}[${c.cyan}${m[1]}${c.reset}${c.dim}]${c.reset} ${m[2]}\n`)
      } else {
        process.stdout.write(`${c.dim}[${c.blue}main${c.reset}${c.dim}]${c.reset} ${trimmed}\n`)
      }
    }
  })
  electronProc.stderr.on('data', (data) => {
    if (exiting) return
    const lines = data.toString().split('\n').filter((l) => l.trim() && !ELECTRON_STDERR_NOISE.test(l))
    for (const line of lines) {
      process.stdout.write(`${c.dim}[${c.red}main${c.reset}${c.dim}]${c.reset} ${line.trim()}\n`)
    }
  })

  electronProc.on('close', (code) => {
    if (exiting) return
    status('main', `Electron exited (code ${code})`, c.yellow)
    cleanup()
  })
}

main().catch((err) => {
  if (activeGroup) activeGroup.abort()
  process.stdout.write(`\n${c.red}Fatal error: ${err.message}${c.reset}\n`)
  cleanup()
})

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

function spinner(label, color = c.cyan) {
  let i = 0
  const id = setInterval(() => {
    process.stdout.write(`\r${c.dim}[${color}${SPINNER[i]}${c.reset}${c.dim}]${c.reset} ${label}`)
    i = (i + 1) % SPINNER.length
  }, 80)
  return {
    succeed: (msg) => {
      clearInterval(id)
      process.stdout.write(`\r${c.dim}[${c.green}✓${c.reset}${c.dim}]${c.reset} ${msg || label}\n`)
    },
    fail: (msg) => {
      clearInterval(id)
      process.stdout.write(`\r${c.dim}[${c.red}✗${c.reset}${c.dim}]${c.reset} ${msg || label}\n`)
    },
  }
}

function killExplorer() {
  return new Promise((resolve) => {
    exec('taskkill /F /IM explorer.exe', () => resolve())
  })
}

function startExplorer() {
  try {
    spawn('explorer.exe', [], { detached: true, stdio: 'ignore', windowsHide: false }).unref()
  } catch {}
}

function waitForPort(port) {
  return new Promise((resolve) => {
    const tryConnect = () => {
      const req = http.get(`http://localhost:${port}`, () => {
        req.destroy()
        resolve()
      })
      req.on('error', () => setTimeout(tryConnect, 200))
    }
    tryConnect()
  })
}

let viteProc = null
let electronProc = null
let exiting = false

function syncWrite(text) {
  try { fs.writeSync(1, text) } catch {}
}

function cleanup() {
  if (exiting) return
  exiting = true

  startExplorer()

  syncWrite(`\n${c.dim}[${c.yellow}shutdown${c.reset}${c.dim}]${c.reset} Stopping services...\n`)
  syncWrite(`${c.dim}[${c.yellow}shutdown${c.reset}${c.dim}]${c.reset} Restoring explorer.exe...\n`)

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
  if (!exiting) startExplorer()
})

async function main() {
  console.clear()
  process.stdout.write(`${c.cyan}${c.bold}${ALPINE}${c.reset}`)
  process.stdout.write(`${c.gray}  ─── Windows Desktop Shell ───${c.reset}\n\n`)

  const killSpin = spinner('Killing explorer.exe', c.yellow)
  await killExplorer()
  killSpin.succeed('explorer.exe stopped')

  const viteSpin = spinner('Starting frontend (Vite)', c.magenta)
  viteProc = spawn('npm', ['run', 'dev'], {
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  viteProc.stdout.on('data', (data) => {
    if (exiting) return
    const lines = data.toString().split('\n').filter((l) => l.trim() && !l.includes('VITE') && !l.includes('ready in') && !l.includes('Local:') && !l.includes('Network:') && !l.includes('plugin-react'))
    for (const line of lines) {
      process.stdout.write(`${c.dim}[${c.magenta}vite${c.reset}${c.dim}]${c.reset} ${line.trim()}\n`)
    }
  })
  viteProc.stderr.on('data', (data) => {
    if (exiting) return
    const text = data.toString().trim()
    if (text) process.stdout.write(`${c.dim}[${c.red}vite${c.reset}${c.dim}]${c.reset} ${text}\n`)
  })

  await waitForPort(5173)
  viteSpin.succeed('Frontend ready on http://localhost:5173')

  const electronSpin = spinner('Starting backend (Electron)', c.blue)
  electronProc = spawn(electronPath, ['.'], {
    cwd: projectRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: false,
  })
  electronSpin.succeed('Backend started')

  console.log(`\n${c.gray}  ─── Logs ───${c.reset}\n`)

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
    const text = data.toString().trim()
    if (text) process.stdout.write(`${c.dim}[${c.red}main${c.reset}${c.dim}]${c.reset} ${text}\n`)
  })

  electronProc.on('close', (code) => {
    if (exiting) return
    status('main', `Electron exited (code ${code})`, c.yellow)
    cleanup()
  })
}

main().catch((err) => {
  process.stdout.write(`\n${c.red}Fatal error: ${err.message}${c.reset}\n`)
  cleanup()
})

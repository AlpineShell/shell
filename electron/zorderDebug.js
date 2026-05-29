const koffi = require('koffi')
const fs = require('fs')
const path = require('path')

const user32 = koffi.load('user32.dll')
const GetForegroundWindow = user32.func('__stdcall', 'GetForegroundWindow', 'uintptr_t', [])
const GetWindowTextW = user32.func('__stdcall', 'GetWindowTextW', 'int', ['uintptr_t', 'void *', 'int'])
const GetClassNameW = user32.func('__stdcall', 'GetClassNameW', 'int', ['uintptr_t', 'void *', 'int'])

function toNum(v) {
  return typeof v === 'bigint' ? Number(v) : v
}
function readW(buf, n) {
  let s = ''
  for (let i = 0; i < n; i++) {
    const c = buf.readUInt16LE(i * 2)
    if (!c) break
    s += String.fromCharCode(c)
  }
  return s
}
function fgInfo() {
  const h = toNum(GetForegroundWindow())
  const tb = Buffer.alloc(512)
  GetWindowTextW(h, tb, 256)
  const cb = Buffer.alloc(512)
  GetClassNameW(h, cb, 256)
  return `fg=${h} cls="${readW(cb, 256)}" title="${readW(tb, 256)}"`
}

function winState(win) {
  if (!win || win.isDestroyed()) return 'destroyed'
  const b = win.getBounds()
  return `vis=${win.isVisible()} top=${win.isAlwaysOnTop()} b=${b.x},${b.y},${b.width}x${b.height}`
}

function start(getShell) {
  const logPath = path.join(__dirname, '..', 'zorder-debug.log')
  const log = (s) => { try { fs.appendFileSync(logPath, s + '\n') } catch {} }
  log(`--- zorder debug start (uptime base) ---`)
  let last = ''
  setInterval(() => {
    const shell = getShell()
    if (!shell) return
    const line = `topbar[${winState(shell.topBar)}] desktop[${winState(shell.desktop)}] ${fgInfo()}`
    if (line !== last) {
      log(`t=${process.uptime().toFixed(1)} ${line}`)
      last = line
    }
  }, 400)
}

module.exports = { start }

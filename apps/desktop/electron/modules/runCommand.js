const { shell } = require('electron')
const { execFile, spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const { shellExecute, warm: warmShellExecute } = require('../shellExecute')

const PATH_WARM_DELAY_MS = 4000

const PATH_EXTS = (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD')
  .split(';')
  .map((ext) => ext.trim().toLowerCase())
  .filter(Boolean)

function expandEnv(input) {
  return String(input).replace(/%([^%]+)%/g, (match, name) => {
    const value = process.env[name] ?? process.env[name.toUpperCase()]
    return value !== undefined ? value : match
  })
}

function isUrl(text) {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(text) || /^www\.[^\s]+\.[^\s]/i.test(text)
}

function splitCommand(input) {
  const text = input.trim()
  if (text.startsWith('"')) {
    const end = text.indexOf('"', 1)
    if (end > 0) return { file: text.slice(1, end), args: text.slice(end + 1).trim() }
    return { file: text.slice(1), args: '' }
  }
  const space = text.indexOf(' ')
  if (space < 0) return { file: text, args: '' }
  return { file: text.slice(0, space), args: text.slice(space + 1).trim() }
}

const SHELL_BASENAMES = new Set(['cmd', 'powershell', 'pwsh', 'wt', 'bash', 'wsl', 'ubuntu'])
const SCRIPT_EXTS = new Set(['.bat', '.cmd', '.ps1', '.vbs'])
const subsystemCache = new Map()

function classifyExecutable(exePath) {
  const key = exePath.toLowerCase()
  if (subsystemCache.has(key)) return subsystemCache.get(key)
  let kind = 'unknown'
  let fd
  try {
    fd = fs.openSync(exePath, 'r')
    const header = Buffer.alloc(4096)
    const read = fs.readSync(fd, header, 0, 4096, 0)
    if (read >= 64 && header.readUInt16LE(0) === 0x5a4d) {
      const peOffset = header.readUInt32LE(0x3c)
      if (peOffset + 94 <= read && header.readUInt32LE(peOffset) === 0x00004550) {
        kind = header.readUInt16LE(peOffset + 92) === 3 ? 'console' : 'gui'
      }
    }
  } catch {
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd) } catch {}
  }
  subsystemCache.set(key, kind)
  return kind
}

function isAppExecutionAlias(exePath) {
  if (!/\\WindowsApps\\/i.test(exePath)) return false
  try { return fs.lstatSync(exePath).isSymbolicLink() } catch { return true }
}

function shouldRunInTerminal(exePath) {
  const ext = path.extname(exePath).toLowerCase()
  if (SHELL_BASENAMES.has(path.basename(exePath, ext).toLowerCase())) return false
  if (SCRIPT_EXTS.has(ext)) return true
  const kind = classifyExecutable(exePath)
  if (kind === 'console') return true
  if (kind === 'gui') return false
  return isAppExecutionAlias(exePath)
}

let pathDirsCache = null
function pathDirs() {
  if (!pathDirsCache) {
    pathDirsCache = (process.env.PATH || '').split(';').map((dir) => dir.trim()).filter(Boolean)
  }
  return pathDirsCache
}

const dirListingCache = new Map()
async function dirListing(dir) {
  const key = dir.toLowerCase()
  const cached = dirListingCache.get(key)
  if (cached) return cached
  const pending = fs.promises.readdir(dir)
    .then((names) => new Set(names.map((name) => name.toLowerCase())))
    .catch(() => new Set())
  dirListingCache.set(key, pending)
  return pending
}

function warmPathDirs() {
  return Promise.all(pathDirs().map((dir) => dirListing(dir))).catch(() => {})
}

function existsLoose(filePath) {
  if (fs.existsSync(filePath)) return true
  try { fs.lstatSync(filePath); return true } catch { return false }
}

async function resolveExecutable(token) {
  if (!token) return null
  const hasExtension = path.extname(token) !== ''
  if (/[\\/]/.test(token) || /^[a-zA-Z]:/.test(token)) {
    if (existsLoose(token)) return token
    if (!hasExtension) for (const ext of PATH_EXTS) if (existsLoose(token + ext)) return token + ext
    return null
  }
  const lower = token.toLowerCase()
  for (const dir of pathDirs()) {
    const names = await dirListing(dir)
    if (hasExtension) {
      if (names.has(lower)) return path.join(dir, token)
    } else {
      for (const ext of PATH_EXTS) {
        if (names.has(lower + ext)) return path.join(dir, token + ext)
      }
    }
  }
  return null
}

async function resolve(raw) {
  const query = String(raw || '').trim()
  if (!query) return null

  if (isUrl(query)) return { kind: 'url', label: 'Open link', display: query, runInTerminal: false }
  if (/^shell:/i.test(query)) return { kind: 'shell', label: 'Open', display: query, runInTerminal: false }

  const expanded = expandEnv(query)
  const hadEnv = expanded !== query

  if (/^([a-zA-Z]:[\\/]|\\\\)/.test(expanded) || (hadEnv && /[\\/]/.test(expanded))) {
    try {
      if (fs.existsSync(expanded)) {
        const isDirectory = fs.statSync(expanded).isDirectory()
        return { kind: isDirectory ? 'folder' : 'file', label: isDirectory ? 'Open folder' : 'Open', display: expanded, runInTerminal: false }
      }
    } catch {}
    return null
  }

  const { file } = splitCommand(expanded)
  const resolved = await resolveExecutable(file)
  if (resolved) {
    const terminal = shouldRunInTerminal(resolved)
    return { kind: 'command', label: terminal ? 'Run in terminal' : 'Run', display: query, runInTerminal: terminal }
  }

  return null
}

let terminalCache = null
async function detectTerminal() {
  if (terminalCache) return terminalCache
  const localApps = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WindowsApps', 'wt.exe')
  const hasWt = !!(await resolveExecutable('wt.exe')) || fs.existsSync(localApps)
  terminalCache = hasWt ? { type: 'wt' } : { type: 'cmd' }
  return terminalCache
}

async function runDirect(raw) {
  const query = String(raw || '').trim()
  if (!query) return { ok: false }
  const info = await resolve(query)

  if (info && (info.kind === 'folder' || info.kind === 'file')) {
    shell.openPath(info.display).catch(() => {})
    return { ok: true }
  }
  if (info && info.kind === 'url') {
    const url = /^www\./i.test(query) ? `https://${query}` : query
    shell.openExternal(url).catch(() => {})
    return { ok: true }
  }
  if (info && info.kind === 'shell') {
    execFile('explorer.exe', [query], { windowsHide: true })
    return { ok: true }
  }

  const { file, args } = splitCommand(expandEnv(query))
  shellExecute(file, args)
  return { ok: true }
}

function spawnDetached(file, args) {
  try {
    const child = spawn(file, args, { detached: true, stdio: 'ignore', windowsHide: false })
    child.on('error', (err) => console.error('[run] terminal spawn error:', file, err.message))
    child.unref()
    return true
  } catch (err) {
    console.error('[run] terminal spawn threw:', file, err.message)
    return false
  }
}

async function runInTerminal(raw) {
  const query = String(raw || '').trim()
  if (!query) return { ok: false }
  const terminal = await detectTerminal()
  if (terminal.type === 'wt' && spawnDetached('wt.exe', ['cmd', '/k', query])) return { ok: true }
  spawnDetached('cmd.exe', ['/k', query])
  return { ok: true }
}

module.exports = {
  handlers: {
    'run/resolve': (_event, query) => resolve(query),
    'run/exec': (_event, query) => runDirect(query),
    'run/exec-terminal': (_event, query) => runInTerminal(query),
  },
  start() {
    setTimeout(() => {
      warmShellExecute()
      warmPathDirs()
    }, PATH_WARM_DELAY_MS)
  },
}

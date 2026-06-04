const { shell } = require('electron')
const { execFile, spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

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

let pathDirsCache = null
function pathDirs() {
  if (!pathDirsCache) {
    pathDirsCache = (process.env.PATH || '').split(';').map((dir) => dir.trim()).filter(Boolean)
  }
  return pathDirsCache
}

function resolveExecutable(token) {
  if (!token) return null
  const hasExtension = path.extname(token) !== ''
  if (/[\\/]/.test(token) || /^[a-zA-Z]:/.test(token)) {
    if (fs.existsSync(token)) return token
    if (!hasExtension) for (const ext of PATH_EXTS) if (fs.existsSync(token + ext)) return token + ext
    return null
  }
  for (const dir of pathDirs()) {
    if (hasExtension) {
      const candidate = path.join(dir, token)
      try { if (fs.existsSync(candidate)) return candidate } catch {}
    } else {
      for (const ext of PATH_EXTS) {
        const candidate = path.join(dir, token + ext)
        try { if (fs.existsSync(candidate)) return candidate } catch {}
      }
    }
  }
  return null
}

function resolve(raw) {
  const query = String(raw || '').trim()
  if (!query) return null

  if (isUrl(query)) return { kind: 'url', label: 'Open link', display: query }
  if (/^shell:/i.test(query)) return { kind: 'shell', label: 'Open', display: query }

  const expanded = expandEnv(query)
  const hadEnv = expanded !== query

  if (/^([a-zA-Z]:[\\/]|\\\\)/.test(expanded) || (hadEnv && /[\\/]/.test(expanded))) {
    try {
      if (fs.existsSync(expanded)) {
        const isDirectory = fs.statSync(expanded).isDirectory()
        return { kind: isDirectory ? 'folder' : 'file', label: isDirectory ? 'Open folder' : 'Open', display: expanded }
      }
    } catch {}
    return null
  }

  const { file } = splitCommand(expanded)
  if (resolveExecutable(file)) return { kind: 'command', label: 'Run', display: query }

  return null
}

let terminalCache = null
function detectTerminal() {
  if (terminalCache) return terminalCache
  const localApps = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WindowsApps', 'wt.exe')
  const hasWt = !!resolveExecutable('wt.exe') || fs.existsSync(localApps)
  terminalCache = hasWt ? { type: 'wt' } : { type: 'cmd' }
  return terminalCache
}

function quotePs(text) {
  return `'${String(text).replace(/'/g, "''")}'`
}

function runShellExecute(file, args) {
  const command = args
    ? `Start-Process -FilePath ${quotePs(file)} -ArgumentList ${quotePs(args)}`
    : `Start-Process -FilePath ${quotePs(file)}`
  execFile('powershell', ['-NoProfile', '-Command', command], { windowsHide: true }, (err) => {
    if (err) console.error('[run] shell execute error:', err.message)
  })
}

function runDirect(raw) {
  const query = String(raw || '').trim()
  if (!query) return { ok: false }
  const info = resolve(query)

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
  runShellExecute(file, args)
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

function runInTerminal(raw) {
  const query = String(raw || '').trim()
  if (!query) return { ok: false }
  if (detectTerminal().type === 'wt' && spawnDetached('wt.exe', ['cmd', '/k', query])) return { ok: true }
  spawnDetached('cmd.exe', ['/k', query])
  return { ok: true }
}

module.exports = {
  handlers: {
    'run/resolve': (_event, query) => resolve(query),
    'run/exec': (_event, query) => runDirect(query),
    'run/exec-terminal': (_event, query) => runInTerminal(query),
  },
}

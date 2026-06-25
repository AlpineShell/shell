const { app, shell, nativeImage } = require('electron')
const { exec } = require('child_process')
const { promisify } = require('util')
const fs = require('fs')
const os = require('os')
const path = require('path')

const execAsync = promisify(exec)
const iconCache = new Map()
let psSeq = 0

function run(command) {
  return execAsync(command, { windowsHide: true, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
    .then(({ stdout }) => stdout || '')
    .catch(() => '')
}

async function runPsScript(script) {
  const id = ++psSeq
  const file = path.join(os.tmpdir(), `alpine-icons-${id}.ps1`)
  try {
    fs.writeFileSync(file, script, 'utf8')
    return await run(`powershell -NoProfile -ExecutionPolicy Bypass -File "${file}"`)
  } finally {
    try { fs.unlinkSync(file) } catch {}
  }
}

function normName(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function expandEnv(p) {
  return String(p || '').replace(/%([^%]+)%/g, (_, key) => process.env[key] || `%${key}%`)
}

const CACHE_FILE = 'icon-cache.json'
const CACHE_MAX_ENTRIES = 4000
const CACHE_MAX_ENTRY_LENGTH = 512 * 1024
const CACHE_WRITE_DEBOUNCE = 1500

let diskCache = null
let diskCacheLoaded = false
let diskCachePath = null
let diskCacheWriteTimer = null
let diskCacheDirty = false
let quitFlushRegistered = false

function getDiskCachePath() {
  if (!diskCachePath) diskCachePath = path.join(app.getPath('userData'), CACHE_FILE)
  return diskCachePath
}

function registerQuitFlush() {
  if (quitFlushRegistered) return
  quitFlushRegistered = true
  app.on('before-quit', flushDiskCache)
  app.on('will-quit', flushDiskCache)
  app.on('quit', flushDiskCache)
}

function loadDiskCache() {
  if (diskCacheLoaded) return diskCache
  diskCacheLoaded = true
  diskCache = new Map()
  registerQuitFlush()
  let raw
  try {
    raw = fs.readFileSync(getDiskCachePath(), 'utf8')
  } catch (e) {
    if (e.code !== 'ENOENT') console.error('[appIcons] cache read error:', e.message)
    return diskCache
  }
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.entries === 'object' && parsed.entries) {
      for (const [key, value] of Object.entries(parsed.entries)) {
        if (typeof value === 'string' && value) diskCache.set(key, value)
      }
    }
  } catch (e) {
    console.error('[appIcons] corrupt cache, rebuilding:', e.message)
    try { fs.renameSync(getDiskCachePath(), getDiskCachePath() + '.bak') } catch {}
  }
  return diskCache
}

function flushDiskCache() {
  if (diskCacheWriteTimer) { clearTimeout(diskCacheWriteTimer); diskCacheWriteTimer = null }
  if (!diskCacheLoaded || !diskCacheDirty) return
  diskCacheDirty = false
  const entries = {}
  for (const [key, value] of diskCache) entries[key] = value
  const tmp = getDiskCachePath() + '.tmp'
  try {
    fs.writeFileSync(tmp, JSON.stringify({ version: 1, entries }))
    fs.renameSync(tmp, getDiskCachePath())
  } catch (e) {
    console.error('[appIcons] cache write error:', e.message)
  }
}

function scheduleDiskCacheWrite() {
  diskCacheDirty = true
  if (diskCacheWriteTimer) clearTimeout(diskCacheWriteTimer)
  diskCacheWriteTimer = setTimeout(flushDiskCache, CACHE_WRITE_DEBOUNCE)
}

function rememberIcon(key, value) {
  if (!key || !value || value.length > CACHE_MAX_ENTRY_LENGTH) return
  const cache = loadDiskCache()
  if (cache.has(key)) cache.delete(key)
  cache.set(key, value)
  while (cache.size > CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value
    cache.delete(oldest)
  }
  scheduleDiskCacheWrite()
}

function fileIconKey(rawPath, index) {
  const expanded = expandEnv(rawPath)
  if (!expanded) return null
  try {
    const stat = fs.statSync(expanded)
    return `file|${expanded.toLowerCase()}|${index | 0}|${Math.round(stat.mtimeMs)}|${stat.size}`
  } catch {
    return null
  }
}

const IMAGE_EXTS = new Set(['.png', '.ico', '.jpg', '.jpeg', '.gif', '.bmp'])

function squirrelRedirect(target) {
  if (!target || !/[\\/]update\.exe$/i.test(target)) return null
  const dir = path.dirname(target)
  try {
    const ico = path.join(dir, 'app.ico')
    if (fs.existsSync(ico)) return ico
    const versions = fs.readdirSync(dir).filter((n) => /^app-/i.test(n)).sort().reverse()
    for (const version of versions) {
      const versionDir = path.join(dir, version)
      let exes = []
      try { exes = fs.readdirSync(versionDir).filter((n) => n.toLowerCase().endsWith('.exe') && !/^update/i.test(n)) } catch {}
      if (exes.length) return path.join(versionDir, exes[0])
    }
  } catch {}
  return null
}

async function iconForFile(filePath) {
  if (!filePath) return null
  const key = filePath.toLowerCase()
  if (iconCache.has(key)) return iconCache.get(key)
  const target = squirrelRedirect(filePath) || filePath
  let url = null
  try {
    if (IMAGE_EXTS.has(path.extname(target).toLowerCase())) {
      const image = nativeImage.createFromPath(target)
      url = image.isEmpty() ? null : image.toDataURL()
    } else {
      const image = await app.getFileIcon(target, { size: 'normal' })
      url = image.isEmpty() ? null : image.toDataURL()
    }
  } catch {
    url = null
  }
  if (!url && !IMAGE_EXTS.has(path.extname(target).toLowerCase())) {
    try { const [robust] = await resolveIcons([{ path: target, index: 0 }]); url = robust || null } catch {}
  }
  iconCache.set(key, url)
  return url
}

async function resolveExeIcons(targets) {
  const result = new Map()
  const pending = []
  for (const original of targets) {
    if (!original) { result.set(original, null); continue }
    const key = original.toLowerCase()
    if (iconCache.has(key)) { result.set(original, iconCache.get(key)); continue }
    const src = squirrelRedirect(original) || original
    if (IMAGE_EXTS.has(path.extname(src).toLowerCase())) {
      let url = null
      try { const image = nativeImage.createFromPath(src); url = image.isEmpty() ? null : image.toDataURL() } catch {}
      if (url) { iconCache.set(key, url); result.set(original, url); continue }
    }
    pending.push({ original, src, key })
  }
  if (pending.length) {
    const urls = await resolveIcons(pending.map((p) => ({ path: p.src, index: 0 })))
    pending.forEach((p, i) => {
      const url = urls[i] || null
      iconCache.set(p.key, url)
      result.set(p.original, url)
    })
  }
  return result
}

function resolveStoreLogo(basePath) {
  if (!basePath) return null
  try {
    if (fs.existsSync(basePath)) return basePath
    const dir = path.dirname(basePath)
    const ext = path.extname(basePath).toLowerCase()
    const base = path.basename(basePath, path.extname(basePath)).toLowerCase()
    if (!fs.existsSync(dir)) return null
    const matches = fs.readdirSync(dir).filter((f) => {
      const low = f.toLowerCase()
      return low.startsWith(base) && low.endsWith(ext) && !low.includes('contrast-black') && !low.includes('contrast-white')
    })
    if (!matches.length) return null
    matches.sort((a, b) => {
      try { return fs.statSync(path.join(dir, b)).size - fs.statSync(path.join(dir, a)).size } catch { return 0 }
    })
    return path.join(dir, matches[0])
  } catch {
    return null
  }
}

const SHORTCUT_DIRS = [
  path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
  path.join(process.env.PROGRAMDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
  path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
]

function collectLnks(dir, out) {
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) collectLnks(full, out)
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.lnk')) out.push(full)
  }
}

function buildShortcutIndex() {
  const list = []
  const byTarget = new Map()
  const byName = new Map()
  const lnkPaths = []
  for (const dir of SHORTCUT_DIRS) collectLnks(dir, lnkPaths)
  for (const lnk of lnkPaths) {
    let info
    try { info = shell.readShortcutLink(lnk) } catch { continue }
    if (!info || !info.target) continue
    const iconPath = info.icon && info.icon.length ? info.icon : info.target
    const entry = { targetLower: info.target.toLowerCase(), iconPath, index: info.iconIndex || 0 }
    list.push(entry)
    if (!byTarget.has(entry.targetLower)) byTarget.set(entry.targetLower, entry)
    const key = normName(path.basename(lnk, '.lnk'))
    if (key && !byName.has(key)) byName.set(key, entry)
  }
  return { list, byTarget, byName }
}

async function resolveIcons(specs) {
  if (!specs.length) return []
  const cache = loadDiskCache()
  const results = new Array(specs.length).fill(null)
  const misses = []
  specs.forEach((spec, i) => {
    const key = fileIconKey(spec.path, spec.index | 0)
    if (key && cache.has(key)) { results[i] = cache.get(key); return }
    misses.push({ resultIndex: i, spec, key })
  })
  if (!misses.length) return results
  const entries = misses.map((m) => `@{ p='${String(m.spec.path).replace(/'/g, "''")}'; i=${m.spec.index | 0} }`).join(',')
  const script = `Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class AlpineIconExtractor {
  [DllImport("shell32.dll", CharSet=CharSet.Unicode)]
  public static extern uint ExtractIconExW(string lpszFile, int nIconIndex, IntPtr[] phiconLarge, IntPtr[] phiconSmall, uint nIcons);
  [DllImport("user32.dll")]
  public static extern int DestroyIcon(IntPtr hIcon);
}
'@
$entries = @(${entries})
$results = @()
foreach ($e in $entries) {
  $p = [Environment]::ExpandEnvironmentVariables($e.p)
  $idx = [int]$e.i
  $b64 = ''
  try {
    $large = New-Object 'IntPtr[]' 1
    $count = [AlpineIconExtractor]::ExtractIconExW($p, $idx, $large, $null, 1)
    if ($count -gt 0 -and $large[0] -ne [IntPtr]::Zero) {
      $icon = [System.Drawing.Icon]::FromHandle($large[0])
      $bmp = $icon.ToBitmap()
      $ms = New-Object System.IO.MemoryStream
      $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
      $b64 = [Convert]::ToBase64String($ms.ToArray())
      $ms.Dispose(); $bmp.Dispose(); $icon.Dispose()
      [void][AlpineIconExtractor]::DestroyIcon($large[0])
    }
  } catch {}
  if ([string]::IsNullOrEmpty($b64)) {
    try {
      $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($p)
      $bmp = $icon.ToBitmap()
      $ms = New-Object System.IO.MemoryStream
      $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
      $b64 = [Convert]::ToBase64String($ms.ToArray())
      $ms.Dispose(); $bmp.Dispose(); $icon.Dispose()
    } catch {}
  }
  $results += $b64
}
$results -join '|'`
  const out = await runPsScript(script)
  const extracted = out.trim().split('|').map((b64) => (b64 && b64.length > 10 ? `data:image/png;base64,${b64}` : null))
  misses.forEach((m, k) => {
    const url = extracted[k] || null
    results[m.resultIndex] = url
    if (url && m.key) rememberIcon(m.key, url)
  })
  return results
}

async function resolveAppIcons(appIds) {
  if (!appIds.length) return []
  const ids = appIds.map((id) => `'${String(id).replace(/'/g, "''")}'`).join(',')
  const script = `Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class AlpineAppIconExtractor {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Auto)]
  public struct SHFILEINFO { public IntPtr hIcon; public int iIcon; public uint dwAttributes; [MarshalAs(UnmanagedType.ByValTStr, SizeConst=260)] public string szDisplayName; [MarshalAs(UnmanagedType.ByValTStr, SizeConst=80)] public string szTypeName; }
  [DllImport("shell32.dll", CharSet=CharSet.Unicode)] public static extern int SHParseDisplayName(string name, IntPtr bc, out IntPtr pidl, uint inAttr, out uint outAttr);
  [DllImport("shell32.dll", CharSet=CharSet.Auto)] public static extern IntPtr SHGetFileInfo(IntPtr pidl, uint attr, ref SHFILEINFO psfi, uint cb, uint flags);
  [DllImport("shell32.dll")] public static extern void ILFree(IntPtr pidl);
  [DllImport("user32.dll")] public static extern int DestroyIcon(IntPtr h);
}
'@
$ids = @(${ids})
$results = @()
foreach ($id in $ids) {
  $b64 = ''
  $pidl = [IntPtr]::Zero
  $attr = 0
  try {
    $hr = [AlpineAppIconExtractor]::SHParseDisplayName(('shell:AppsFolder\\' + $id), [IntPtr]::Zero, [ref]$pidl, 0, [ref]$attr)
    if ($hr -eq 0 -and $pidl -ne [IntPtr]::Zero) {
      $info = New-Object AlpineAppIconExtractor+SHFILEINFO
      $sz = [uint32][Runtime.InteropServices.Marshal]::SizeOf([type]([AlpineAppIconExtractor+SHFILEINFO]))
      $null = [AlpineAppIconExtractor]::SHGetFileInfo($pidl, 0, [ref]$info, $sz, (0x100 -bor 0x8))
      if ($info.hIcon -ne [IntPtr]::Zero) {
        $icon = [System.Drawing.Icon]::FromHandle($info.hIcon)
        $bmp = $icon.ToBitmap()
        $ms = New-Object System.IO.MemoryStream
        $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
        $b64 = [Convert]::ToBase64String($ms.ToArray())
        $ms.Dispose(); $bmp.Dispose(); $icon.Dispose()
        [void][AlpineAppIconExtractor]::DestroyIcon($info.hIcon)
      }
    }
  } catch {}
  if ($pidl -ne [IntPtr]::Zero) { [AlpineAppIconExtractor]::ILFree($pidl) }
  $results += $b64
}
$results -join '|'`
  const out = await runPsScript(script)
  return out.trim().split('|').map((b64) => (b64 && b64.length > 10 ? `data:image/png;base64,${b64}` : null))
}

let genericIconUrl = null

async function ensureGenericIcon() {
  if (genericIconUrl !== null) return genericIconUrl
  const script = `Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class AlpineShFileInfo {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Auto)]
  public struct SHFILEINFO { public IntPtr hIcon; public int iIcon; public uint dwAttributes; [MarshalAs(UnmanagedType.ByValTStr, SizeConst=260)] public string szDisplayName; [MarshalAs(UnmanagedType.ByValTStr, SizeConst=80)] public string szTypeName; }
  [DllImport("shell32.dll", CharSet=CharSet.Auto)] public static extern IntPtr SHGetFileInfo(string p, uint a, ref SHFILEINFO i, uint c, uint f);
  [DllImport("user32.dll")] public static extern int DestroyIcon(IntPtr h);
}
'@
$info = New-Object AlpineShFileInfo+SHFILEINFO
$sz = [uint32][Runtime.InteropServices.Marshal]::SizeOf([type]([AlpineShFileInfo+SHFILEINFO]))
$b64 = ''
try {
  [void][AlpineShFileInfo]::SHGetFileInfo('generic.exe', 0x80, [ref]$info, $sz, (0x100 -bor 0x10))
  if ($info.hIcon -ne [IntPtr]::Zero) {
    $icon = [System.Drawing.Icon]::FromHandle($info.hIcon)
    $bmp = $icon.ToBitmap()
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $b64 = [Convert]::ToBase64String($ms.ToArray())
    $ms.Dispose(); $bmp.Dispose(); $icon.Dispose()
    [void][AlpineShFileInfo]::DestroyIcon($info.hIcon)
  }
} catch {}
$b64`
  const out = (await runPsScript(script)).trim()
  genericIconUrl = out && out.length > 10 ? `data:image/png;base64,${out}` : null
  return genericIconUrl
}

function getGenericIcon() {
  return genericIconUrl
}

module.exports = {
  iconForFile,
  resolveIcons,
  resolveAppIcons,
  resolveExeIcons,
  ensureGenericIcon,
  getGenericIcon,
  buildShortcutIndex,
  resolveStoreLogo,
  normName,
  expandEnv,
}

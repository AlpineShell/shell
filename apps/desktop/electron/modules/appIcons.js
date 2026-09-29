const { app, shell, nativeImage } = require('electron')
const { exec } = require('child_process')
const { promisify } = require('util')
const fs = require('fs')
const os = require('os')
const path = require('path')
const appxPackages = require('./appxPackages')
const { quotePowerShellLiteral, writePowerShellScriptFile } = require('../powershell')

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
    writePowerShellScriptFile(file, script)
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
const CACHE_VERSION = 2
const CACHE_MAX_ENTRIES = 4000
const CACHE_MAX_ENTRY_LENGTH = 512 * 1024
const CACHE_WRITE_DEBOUNCE = 1500
const ASYNC_TMP_SUFFIX = '.tmp'
const QUIT_TMP_SUFFIX = '.tmp-quit'

let diskCache = null
let diskCacheLoaded = false
let diskCachePath = null
let diskCacheWriteTimer = null
let diskCacheDirty = false
let quitFlushRegistered = false
let asyncWriteInFlight = false
let asyncWriteChain = Promise.resolve()
let quitting = false

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

function migrateLegacyEntry(key, url) {
  const parts = key.split('|')
  if (parts[0] !== 'file' || parts.length !== 5) return null
  return { key: `file|${parts[1]}|${parts[2]}`, entry: { stamp: `${parts[3]}|${parts[4]}`, url } }
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
        if (value && typeof value === 'object' && typeof value.url === 'string' && value.url) {
          diskCache.set(key, { stamp: String(value.stamp || ''), url: value.url })
        } else if (typeof value === 'string' && value) {
          const migrated = migrateLegacyEntry(key, value)
          if (migrated) diskCache.set(migrated.key, migrated.entry)
        }
      }
      if (parsed.version !== CACHE_VERSION) scheduleDiskCacheWrite()
    }
  } catch (e) {
    console.error('[appIcons] corrupt cache, rebuilding:', e.message)
    try { fs.renameSync(getDiskCachePath(), getDiskCachePath() + '.bak') } catch {}
  }
  return diskCache
}

function serializeDiskCache() {
  const entries = {}
  for (const [key, value] of diskCache) entries[key] = value
  return JSON.stringify({ version: CACHE_VERSION, entries })
}

function flushDiskCache() {
  quitting = true
  if (diskCacheWriteTimer) { clearTimeout(diskCacheWriteTimer); diskCacheWriteTimer = null }
  if (!diskCacheLoaded || (!diskCacheDirty && !asyncWriteInFlight)) return
  diskCacheDirty = false
  const tmp = `${getDiskCachePath()}${QUIT_TMP_SUFFIX}`
  try {
    fs.writeFileSync(tmp, serializeDiskCache())
    fs.renameSync(tmp, getDiskCachePath())
  } catch (e) {
    console.error('[appIcons] cache write error:', e.message)
  }
}

async function writeDiskCacheAsync() {
  if (!diskCacheLoaded || !diskCacheDirty || quitting) return
  diskCacheDirty = false
  asyncWriteInFlight = true
  const tmp = `${getDiskCachePath()}${ASYNC_TMP_SUFFIX}`
  try {
    await fs.promises.writeFile(tmp, serializeDiskCache())
    if (quitting) await fs.promises.unlink(tmp)
    else await fs.promises.rename(tmp, getDiskCachePath())
  } catch (e) {
    console.error('[appIcons] cache write error:', e.message)
    try { await fs.promises.unlink(tmp) } catch { void 0 }
  } finally {
    asyncWriteInFlight = false
  }
}

function scheduleDiskCacheWrite() {
  diskCacheDirty = true
  if (diskCacheWriteTimer) clearTimeout(diskCacheWriteTimer)
  diskCacheWriteTimer = setTimeout(() => {
    diskCacheWriteTimer = null
    asyncWriteChain = asyncWriteChain.then(writeDiskCacheAsync)
  }, CACHE_WRITE_DEBOUNCE)
}

function rememberIcon(key, stamp, url) {
  if (!key || !url || url.length > CACHE_MAX_ENTRY_LENGTH) return
  const cache = loadDiskCache()
  if (cache.has(key)) cache.delete(key)
  cache.set(key, { stamp: String(stamp || ''), url })
  while (cache.size > CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value
    cache.delete(oldest)
  }
  scheduleDiskCacheWrite()
}

function cachedIconFor(key, stamp) {
  if (!key) return null
  const entry = loadDiskCache().get(key)
  if (!entry || entry.stamp !== String(stamp || '')) return null
  return entry.url
}

function fileStamp(filePath) {
  try {
    const stat = fs.statSync(filePath)
    return `${Math.round(stat.mtimeMs)}|${stat.size}`
  } catch {
    return null
  }
}

function fileIconIdentity(rawPath, index) {
  const expanded = expandEnv(rawPath)
  if (!expanded) return null
  const stamp = fileStamp(expanded)
  if (stamp === null) return null
  return { key: `file|${expanded.toLowerCase()}|${index | 0}`, stamp }
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
  const packagedUrl = packagedIconDataUrl(target)
  if (packagedUrl) {
    iconCache.set(key, packagedUrl)
    return packagedUrl
  }
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
    const packagedUrl = packagedIconDataUrl(src)
    if (packagedUrl) { iconCache.set(key, packagedUrl); result.set(original, packagedUrl); continue }
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

function packagedAppRoot(exePath) {
  if (!exePath) return null
  const marker = '\\windowsapps\\'
  const markerIndex = exePath.toLowerCase().indexOf(marker)
  if (markerIndex < 0) return null
  const afterMarker = exePath.slice(markerIndex + marker.length)
  const packageSegment = afterMarker.split(/[\\/]/)[0]
  if (!packageSegment) return null
  return exePath.slice(0, markerIndex + marker.length) + packageSegment
}

function packagedIconPath(exePath) {
  if (!exePath || !/\.exe$/i.test(exePath)) return null
  const root = packagedAppRoot(exePath)
  if (!root) return null
  let manifest
  try {
    manifest = fs.readFileSync(path.join(root, 'AppxManifest.xml'), 'utf8')
  } catch {
    return null
  }
  const match = manifest.match(/Square44x44Logo\s*=\s*"([^"]+)"/i)
  if (!match) return null
  const relativeLogo = match[1].replace(/\//g, '\\')
  return resolveStoreLogo(path.join(root, relativeLogo))
}

function packagedIconDataUrl(exePath) {
  const logoPath = packagedIconPath(exePath)
  if (!logoPath) return null
  try {
    const image = nativeImage.createFromPath(logoPath)
    return image.isEmpty() ? null : image.toDataURL()
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

const shortcutLinkCache = new Map()

function readShortcutLinkCached(lnkPath) {
  const key = lnkPath.toLowerCase()
  const stamp = fileStamp(lnkPath)
  if (stamp === null) { shortcutLinkCache.delete(key); return null }
  const cached = shortcutLinkCache.get(key)
  if (cached && cached.stamp === stamp) return cached.info
  let info
  try { info = shell.readShortcutLink(lnkPath) } catch { shortcutLinkCache.delete(key); return null }
  shortcutLinkCache.set(key, { stamp, info })
  return info
}

function buildShortcutIndex() {
  const list = []
  const byTarget = new Map()
  const byName = new Map()
  const lnkPaths = []
  for (const dir of SHORTCUT_DIRS) collectLnks(dir, lnkPaths)
  for (const lnk of lnkPaths) {
    const info = readShortcutLinkCached(lnk)
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
  const results = new Array(specs.length).fill(null)
  const misses = []
  specs.forEach((spec, i) => {
    const identity = fileIconIdentity(spec.path, spec.index | 0)
    const cached = identity && cachedIconFor(identity.key, identity.stamp)
    if (cached) { results[i] = cached; return }
    misses.push({ resultIndex: i, spec, identity })
  })
  if (!misses.length) return results
  const entries = misses.map((m) => `@{ p=${quotePowerShellLiteral(m.spec.path)}; i=${m.spec.index | 0} }`).join(',')
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
    if (url && m.identity) rememberIcon(m.identity.key, m.identity.stamp, url)
  })
  return results
}

function appIconIdentity(appId) {
  const id = String(appId || '')
  const separator = id.indexOf('!')
  if (separator <= 0) return null
  const fullName = appxPackages.packageFullNameForFamily(id.slice(0, separator))
  if (!fullName) return null
  return { key: `appid|${id.toLowerCase()}`, stamp: fullName }
}

async function resolveAppIcons(appIds) {
  if (!appIds.length) return []
  const results = new Array(appIds.length).fill(null)
  const misses = []
  appIds.forEach((appId, i) => {
    const identity = appIconIdentity(appId)
    const cached = identity && cachedIconFor(identity.key, identity.stamp)
    if (cached) { results[i] = cached; return }
    misses.push({ resultIndex: i, appId, identity })
  })
  if (!misses.length) return results
  const extracted = await extractAppIcons(misses.map((m) => m.appId))
  misses.forEach((m, k) => {
    const url = extracted[k] || null
    results[m.resultIndex] = url
    if (url && m.identity) rememberIcon(m.identity.key, m.identity.stamp, url)
  })
  return results
}

async function extractAppIcons(appIds) {
  const ids = appIds.map(quotePowerShellLiteral).join(',')
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

const GENERIC_ICON_KEY = 'generic|shell32'
const SHELL32_PATH = path.join(process.env.SystemRoot || '', 'System32', 'shell32.dll')

async function ensureGenericIcon() {
  if (genericIconUrl !== null) return genericIconUrl
  const stamp = fileStamp(SHELL32_PATH) || ''
  const cached = cachedIconFor(GENERIC_ICON_KEY, stamp)
  if (cached) {
    genericIconUrl = cached
    return genericIconUrl
  }
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
  if (genericIconUrl) rememberIcon(GENERIC_ICON_KEY, stamp, genericIconUrl)
  return genericIconUrl
}

function getGenericIcon() {
  return genericIconUrl
}

module.exports = {
  flushDiskCache,
  iconForFile,
  resolveIcons,
  resolveAppIcons,
  resolveExeIcons,
  ensureGenericIcon,
  getGenericIcon,
  buildShortcutIndex,
  readShortcutLinkCached,
  resolveStoreLogo,
  normName,
  expandEnv,
}

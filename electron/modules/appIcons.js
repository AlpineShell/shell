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

const IMAGE_EXTS = new Set(['.png', '.ico', '.jpg', '.jpeg', '.gif', '.bmp'])

async function iconForFile(filePath) {
  if (!filePath) return null
  const key = filePath.toLowerCase()
  if (iconCache.has(key)) return iconCache.get(key)
  let url = null
  try {
    if (IMAGE_EXTS.has(path.extname(filePath).toLowerCase())) {
      const image = nativeImage.createFromPath(filePath)
      url = image.isEmpty() ? null : image.toDataURL()
    } else {
      const image = await app.getFileIcon(filePath, { size: 'normal' })
      url = image.isEmpty() ? null : image.toDataURL()
    }
  } catch {
    url = null
  }
  iconCache.set(key, url)
  return url
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
  const entries = specs.map((s) => `@{ p='${String(s.path).replace(/'/g, "''")}'; i=${s.index | 0} }`).join(',')
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
  ensureGenericIcon,
  getGenericIcon,
  buildShortcutIndex,
  resolveStoreLogo,
  normName,
  expandEnv,
}

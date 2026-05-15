const { app, shell: electronShell, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')
const { execFile } = require('child_process')
const { forceForeground } = require('./winFocus')

const SCAN_DIRS = [
  path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
  path.join(process.env.PROGRAMDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
  path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
]

let index = []
let broadcast = null
let shells = null
let activeDisplayId = null
let activeTopBar = null
let hideTimeout = null

const LAUNCHER_WIDTH = 600

function walkShortcuts(dir, out) {
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkShortcuts(full, out)
    } else if (entry.isFile()) {
      const lower = entry.name.toLowerCase()
      if (lower.endsWith('.lnk') || lower.endsWith('.url')) out.push(full)
    }
  }
}

function readUrlShortcut(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    const urlMatch = content.match(/^URL=(.+)$/m)
    if (!urlMatch) return null
    const iconMatch = content.match(/^IconFile=(.+)$/m)
    const indexMatch = content.match(/^IconIndex=(-?\d+)$/m)
    return {
      target: urlMatch[1].trim(),
      icon: iconMatch ? iconMatch[1].trim() : null,
      iconIndex: indexMatch ? parseInt(indexMatch[1], 10) : 0,
    }
  } catch {
    return null
  }
}

function getUwpApps() {
  return new Promise((resolve) => {
    const script = `
$apps = Get-StartApps | Where-Object { $_.AppID -match '!' }
foreach ($a in $apps) {
  $icon = ''
  try {
    $family = ($a.AppID -split '!')[0]
    $pkg = Get-AppxPackage | Where-Object { $_.PackageFamilyName -eq $family } | Select-Object -First 1
    if ($pkg) {
      $manifest = Get-AppxPackageManifest -Package $pkg.PackageFullName
      $logo = $manifest.Package.Properties.Logo
      $logoDir = Split-Path (Join-Path $pkg.InstallLocation $logo)
      $logoBase = [System.IO.Path]::GetFileNameWithoutExtension($logo)
      $logoExt = [System.IO.Path]::GetExtension($logo)
      $candidates = Get-ChildItem $logoDir -Filter "$logoBase*" -ErrorAction SilentlyContinue | Where-Object { $_.Extension -match '\\.(png|jpg|jpeg)$' } | Sort-Object { $_.Length } -Descending
      $best = $candidates | Select-Object -First 1
      if ($best) {
        $bytes = [System.IO.File]::ReadAllBytes($best.FullName)
        $icon = [Convert]::ToBase64String($bytes)
      }
    }
  } catch {}
  Write-Output ($a.Name + '||' + $a.AppID + '||' + $icon)
}
`
    execFile('powershell', ['-NoProfile', '-Command', script], { maxBuffer: 50 * 1024 * 1024 }, (err, stdout) => {
      if (err) {
        console.error('[launcher] UWP discovery error:', err.message)
        return resolve([])
      }
      const apps = []
      for (const line of stdout.trim().split('\n')) {
        const parts = line.trim().split('||')
        if (parts.length >= 2 && parts[0] && parts[1]) {
          const icon = parts[2] && parts[2].length > 10 ? `data:image/png;base64,${parts[2]}` : null
          apps.push({ name: parts[0].trim(), appId: parts[1].trim(), icon })
        }
      }
      resolve(apps)
    })
  })
}

function extractIcons(specs) {
  return new Promise((resolve) => {
    const entries = specs.map((s) => `@{ p='${s.path.replace(/'/g, "''")}'; i=${s.index | 0} }`).join(',')
    const script = `
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class IconExtractor {
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
    $count = [IconExtractor]::ExtractIconExW($p, $idx, $large, $null, 1)
    if ($count -gt 0 -and $large[0] -ne [IntPtr]::Zero) {
      $icon = [System.Drawing.Icon]::FromHandle($large[0])
      $bmp = $icon.ToBitmap()
      $ms = New-Object System.IO.MemoryStream
      $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
      $b64 = [Convert]::ToBase64String($ms.ToArray())
      $ms.Dispose()
      $bmp.Dispose()
      $icon.Dispose()
      [void][IconExtractor]::DestroyIcon($large[0])
    }
  } catch {}
  if ([string]::IsNullOrEmpty($b64)) {
    try {
      $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($p)
      $bmp = $icon.ToBitmap()
      $ms = New-Object System.IO.MemoryStream
      $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
      $b64 = [Convert]::ToBase64String($ms.ToArray())
      $ms.Dispose()
      $bmp.Dispose()
      $icon.Dispose()
    } catch {}
  }
  $results += $b64
}
$results -join '|'
`
    execFile('powershell', ['-NoProfile', '-Command', script], { maxBuffer: 50 * 1024 * 1024 }, (err, stdout) => {
      if (err) {
        console.error('[launcher] icon extraction error:', err.message)
        return resolve(specs.map(() => null))
      }
      const parts = stdout.trim().split('|')
      resolve(parts.map((b64) => b64 && b64.length > 10 ? `data:image/png;base64,${b64}` : null))
    })
  })
}

async function buildIndex() {
  const shortcutPaths = []
  for (const dir of SCAN_DIRS) walkShortcuts(dir, shortcutPaths)

  const seenNames = new Set()
  const items = []

  for (const scPath of shortcutPaths) {
    const isUrl = scPath.toLowerCase().endsWith('.url')
    let info
    if (isUrl) {
      info = readUrlShortcut(scPath)
    } else {
      try { info = electronShell.readShortcutLink(scPath) } catch { continue }
    }
    if (!info?.target) continue

    const name = path.basename(scPath, path.extname(scPath))
    const dedupeKey = name.toLowerCase()
    if (seenNames.has(dedupeKey)) continue
    seenNames.add(dedupeKey)

    items.push({
      id: items.length,
      name,
      lnkPath: scPath,
      target: info.target,
      iconSource: info.icon && info.icon.length > 0 ? info.icon : (isUrl ? null : info.target),
      iconIndex: info.iconIndex || 0,
      icon: null,
      isUrl,
    })
  }

  items.sort((a, b) => a.name.localeCompare(b.name))
  for (let i = 0; i < items.length; i++) items[i].id = i
  index = items
  if (broadcast) broadcast('launcher/index-changed', index)

  getUwpApps().then((uwpApps) => {
    let added = false
    for (const uwp of uwpApps) {
      const dedupeKey = uwp.name.toLowerCase()
      if (seenNames.has(dedupeKey)) continue
      seenNames.add(dedupeKey)
      items.push({
        id: items.length,
        name: uwp.name,
        lnkPath: null,
        appId: uwp.appId,
        target: uwp.appId,
        icon: uwp.icon,
      })
      added = true
    }
    if (added) {
      items.sort((a, b) => a.name.localeCompare(b.name))
      for (let i = 0; i < items.length; i++) items[i].id = i
      index = items
      if (broadcast) broadcast('launcher/index-changed', index)
    }
  }).catch((e) => console.error('[launcher] UWP error:', e.message))

  const iconItems = items.filter((i) => i.iconSource && i.iconSource.includes('\\'))
  if (iconItems.length > 0) {
    const icons = await extractIcons(iconItems.map((i) => ({ path: i.iconSource, index: i.iconIndex || 0 })))
    let changed = false
    for (let k = 0; k < iconItems.length; k++) {
      if (icons[k]) {
        iconItems[k].icon = icons[k]
        changed = true
      }
    }
    if (changed && broadcast) broadcast('launcher/index-changed', index)
  }
}

let rebuildTimer = null
function scheduleRebuild() {
  if (rebuildTimer) clearTimeout(rebuildTimer)
  rebuildTimer = setTimeout(() => {
    rebuildTimer = null
    buildIndex().catch((e) => console.error('[launcher] rebuild error:', e.message))
  }, 1000)
}

function watchScanDirs() {
  for (const dir of SCAN_DIRS) {
    try {
      fs.watch(dir, { recursive: true }, scheduleRebuild)
    } catch (e) {
      console.error(`[launcher] watch error for ${dir}:`, e.message)
    }
  }
}

function setShells(s) {
  shells = s
}

function isLauncherActive(win) {
  return activeTopBar === win
}

function animatedHide() {
  if (!activeTopBar || activeTopBar.isDestroyed()) return
  activeTopBar.webContents.send('launcher/start-close')
  if (hideTimeout) clearTimeout(hideTimeout)
  const topBar = activeTopBar
  activeTopBar = null
  activeDisplayId = null
  hideTimeout = setTimeout(() => {
    hideTimeout = null
    if (topBar.isDestroyed()) return
    topBar.webContents.send('launcher/hide')
    topBar.setFocusable(false)
    topBar.setAlwaysOnTop(false)
  }, 110)
}

function showLauncher(displayId) {
  if (!shells) return
  const shell = shells.get(displayId)
  if (!shell || shell.topBar.isDestroyed()) return
  const topBar = shell.topBar

  if (hideTimeout) {
    clearTimeout(hideTimeout)
    hideTimeout = null
  }

  if (activeTopBar && activeTopBar !== topBar && !activeTopBar.isDestroyed()) {
    activeTopBar.webContents.send('launcher/hide')
    activeTopBar.setFocusable(false)
    activeTopBar.setAlwaysOnTop(false)
  }

  topBar.webContents.send('topbar/close-menus')
  topBar.setFocusable(true)
  topBar.setIgnoreMouseEvents(false)
  topBar.setAlwaysOnTop(true, 'screen-saver')

  const bounds = topBar.getBounds()
  topBar.setBounds({ ...bounds, height: 600 })

  topBar.webContents.send('launcher/show', { displayId })
  try {
    const hwnd = topBar.getNativeWindowHandle().readUInt32LE(0)
    forceForeground(hwnd)
  } catch (e) {
    console.error('[launcher] forceForeground error:', e.message)
  }
  topBar.focus()

  activeDisplayId = displayId
  activeTopBar = topBar
}

function showFromHotkey() {
  if (activeTopBar) {
    animatedHide()
    return
  }
  const { screen } = require('electron')
  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursor)
  showLauncher(display.id)
}

function handleBlur(topBar) {
  if (activeTopBar !== topBar) return
  animatedHide()
}

module.exports = {
  handlers: {
    'launcher/index': () => index,
    'launcher/show': (event) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      const { screen } = require('electron')
      const display = win ? screen.getDisplayMatching(win.getBounds()) : screen.getPrimaryDisplay()
      showLauncher(display.id)
    },
    'launcher/hide': () => animatedHide(),
    'launcher/launch': (_event, id) => {
      const item = index.find((i) => i.id === id)
      if (!item) return { success: false }
      animatedHide()
      if (item.lnkPath) {
        electronShell.openPath(item.lnkPath).then((err) => {
          if (err) {
            console.error('[launcher] openPath failed for', item.lnkPath, '-', err)
            const { execFile } = require('child_process')
            execFile('explorer.exe', [item.lnkPath], (e) => {
              if (e && e.code !== 1) console.error('[launcher] explorer fallback error:', e.message)
            })
          }
        })
      } else if (item.appId) {
        const { execFile } = require('child_process')
        execFile('explorer.exe', [`shell:AppsFolder\\${item.appId}`], (e) => {
          if (e && e.code !== 1) console.error('[launcher] launch UWP error:', e.message)
        })
      }
      return { success: true }
    },
    'launcher/launch-admin': (_event, id) => {
      const item = index.find((i) => i.id === id)
      if (!item) return { success: false }
      animatedHide()
      const target = item.lnkPath || (item.appId ? `shell:AppsFolder\\${item.appId}` : null)
      if (target) {
        const { exec } = require('child_process')
        exec(`powershell -NoProfile -Command "Start-Process '${target.replace(/'/g, "''")}' -Verb RunAs"`)
      }
      return { success: true }
    },
    'launcher/uninstall': (_event, id) => {
      const item = index.find((i) => i.id === id)
      if (!item) return { success: false }
      animatedHide()
      if (item.appId) {
        const family = item.appId.split('!')[0]
        const { exec } = require('child_process')
        exec(`powershell -NoProfile -Command "Get-AppxPackage '${family}' | Remove-AppxPackage"`)
      } else {
        electronShell.openExternal('ms-settings:appsfeatures')
      }
      return { success: true }
    },
    'launcher/close-window': (_event, hwnd) => {
      animatedHide()
      const { exec } = require('child_process')
      exec(`powershell -NoProfile -Command "(New-Object -ComObject WScript.Shell).AppActivate([int]0); Add-Type -Name W -Namespace W -MemberDefinition '[DllImport(\\\"user32.dll\\\")] public static extern int PostMessage(IntPtr h,uint m,int w,int l);'; [W.W]::PostMessage([IntPtr]${hwnd}, 0x0010, 0, 0)"`)
      return { success: true }
    },
    'launcher/end-task': (_event, pid) => {
      animatedHide()
      try { process.kill(pid) } catch {}
      return { success: true }
    },
    'launcher/open-location': (_event, id) => {
      const item = index.find((i) => i.id === id)
      if (!item || !item.lnkPath) return { success: false }
      electronShell.showItemInFolder(item.lnkPath)
      return { success: true }
    },
  },
  setShells,
  showFromHotkey,
  isLauncherActive,
  handleBlur,
  start(b) {
    broadcast = b
    buildIndex().catch((e) => console.error('[launcher] initial index error:', e.message))
    watchScanDirs()
  },
}

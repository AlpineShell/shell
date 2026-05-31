const { app, shell: electronShell, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')
const { execFile, exec } = require('child_process')
const { forceForeground } = require('./winFocus')
const appIcons = require('./appIcons')

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

function publishIndex() {
  if (!broadcast) return
  broadcast('launcher/index-changed', index)
  broadcast('apps/catalog-changed', index)
}

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
    $appPart = ($a.AppID -split '!')[1]
    $pkg = Get-AppxPackage | Where-Object { $_.PackageFamilyName -eq $family } | Select-Object -First 1
    if ($pkg) {
      $manifest = Get-AppxPackageManifest -Package $pkg.PackageFullName
      $allApps = @($manifest.Package.Applications.Application)
      $app = $null
      if ($appPart) { $app = $allApps | Where-Object { $_.Id -eq $appPart } | Select-Object -First 1 }
      if (-not $app) { $app = $allApps[0] }
      $logo = $null
      if ($app -and $app.VisualElements) {
        if ($app.VisualElements.Square44x44Logo) { $logo = $app.VisualElements.Square44x44Logo }
        elseif ($app.VisualElements.Square150x150Logo) { $logo = $app.VisualElements.Square150x150Logo }
      }
      if (-not $logo) { $logo = $manifest.Package.Properties.Logo }
      if ($logo) {
        $logoDir = Split-Path (Join-Path $pkg.InstallLocation $logo)
        $logoBase = [System.IO.Path]::GetFileNameWithoutExtension($logo)
        $pattern = "^" + [Regex]::Escape($logoBase) + "\\.scale-(\\d+)\\.(png|jpg|jpeg)$"
        $best = Get-ChildItem $logoDir -ErrorAction SilentlyContinue |
          Where-Object { $_.Name -match $pattern } |
          Sort-Object @{ Expression = { [int]([Regex]::Match($_.Name, 'scale-(\\d+)').Groups[1].Value) }; Descending = $true } |
          Select-Object -First 1
        if (-not $best) {
          $best = Get-ChildItem $logoDir -Filter "$logoBase*" -ErrorAction SilentlyContinue |
            Where-Object { $_.Extension -match '\\.(png|jpg|jpeg)$' -and $_.Name -notmatch 'contrast' } |
            Sort-Object Length -Descending |
            Select-Object -First 1
        }
        if ($best) {
          $bytes = [System.IO.File]::ReadAllBytes($best.FullName)
          $icon = [Convert]::ToBase64String($bytes)
        }
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
          const appId = parts[1].trim()
          if (appId.toLowerCase().startsWith('windows.immersivecontrolpanel')) continue
          const icon = parts[2] && parts[2].length > 10 ? `data:image/png;base64,${parts[2]}` : null
          apps.push({ name: parts[0].trim(), appId, icon })
        }
      }
      resolve(apps)
    })
  })
}

const BLOCKED_NAMES = new Set(['settings'])

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
    if (info.target.toLowerCase().startsWith('ms-settings:')) continue

    const name = path.basename(scPath, path.extname(scPath))
    const dedupeKey = name.toLowerCase()
    if (BLOCKED_NAMES.has(dedupeKey)) continue
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
  publishIndex()

  const generic = await appIcons.ensureGenericIcon()

  getUwpApps().then((uwpApps) => {
    let added = false
    for (const uwp of uwpApps) {
      const dedupeKey = uwp.name.toLowerCase()
      if (BLOCKED_NAMES.has(dedupeKey)) continue
      if (seenNames.has(dedupeKey)) continue
      seenNames.add(dedupeKey)
      items.push({
        id: items.length,
        name: uwp.name,
        lnkPath: null,
        appId: uwp.appId,
        target: uwp.appId,
        icon: uwp.icon || generic,
      })
      added = true
    }
    if (added) {
      items.sort((a, b) => a.name.localeCompare(b.name))
      for (let i = 0; i < items.length; i++) items[i].id = i
      index = items
      publishIndex()
    }
  }).catch((e) => console.error('[launcher] UWP error:', e.message))

  const iconItems = items.filter((i) => i.iconSource && i.iconSource.includes('\\'))
  if (iconItems.length > 0) {
    const icons = await appIcons.resolveIcons(iconItems.map((i) => ({ path: i.iconSource, index: i.iconIndex || 0 })))
    for (let k = 0; k < iconItems.length; k++) iconItems[k].icon = icons[k] || generic
  }
  for (const item of items) if (!item.icon) item.icon = generic
  publishIndex()
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
    if (!fs.existsSync(dir)) continue
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

function findItem(id) {
  return index.find((i) => i.id === id)
}

function launchItem(item) {
  if (!item) return { success: false }
  if (item.lnkPath) {
    electronShell.openPath(item.lnkPath).then((err) => {
      if (err) {
        console.error('[launcher] openPath failed for', item.lnkPath, '-', err)
        execFile('explorer.exe', [item.lnkPath], (e) => {
          if (e && e.code !== 1) console.error('[launcher] explorer fallback error:', e.message)
        })
      }
    })
  } else if (item.appId) {
    const escapedAppId = item.appId.replace(/"/g, '\\"')
    const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
[ComImport, Guid("2E941141-7F97-4756-BA1D-9DECDE894A3D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IApplicationActivationManager {
  [PreserveSig]
  int ActivateApplication([In] string appUserModelId, [In] string arguments, [In] uint options, [Out] out uint processId);
}
public static class UwpLauncher {
  public static int Launch(string appId) {
    Type t = Type.GetTypeFromCLSID(new Guid("45BA127D-10A8-46EA-8AB7-56EA9078943C"));
    object obj = Activator.CreateInstance(t);
    IApplicationActivationManager iam = (IApplicationActivationManager)obj;
    uint pid;
    return iam.ActivateApplication(appId, null, 0, out pid);
  }
}
"@
[void][UwpLauncher]::Launch("${escapedAppId}")
`
    execFile('powershell', ['-NoProfile', '-Command', script], (e) => {
      if (e && e.code !== 1) console.error('[launcher] launch UWP error:', e.message)
    })
  }
  return { success: true }
}

function launchAdminItem(item) {
  if (!item) return { success: false }
  const target = item.lnkPath || (item.appId ? `shell:AppsFolder\\${item.appId}` : null)
  if (target) {
    exec(`powershell -NoProfile -Command "Start-Process '${target.replace(/'/g, "''")}' -Verb RunAs"`)
  }
  return { success: true }
}

function uninstallItem(item) {
  if (!item) return { success: false }
  if (item.appId) {
    const family = item.appId.split('!')[0]
    exec(`powershell -NoProfile -Command "Get-AppxPackage '${family}' | Remove-AppxPackage"`)
  } else {
    electronShell.openExternal('ms-settings:appsfeatures')
  }
  return { success: true }
}

function openItemLocation(item) {
  if (!item || !item.lnkPath) return { success: false }
  electronShell.showItemInFolder(item.lnkPath)
  return { success: true }
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
      const item = findItem(id)
      if (!item) return { success: false }
      animatedHide()
      return launchItem(item)
    },
    'launcher/launch-admin': (_event, id) => {
      const item = findItem(id)
      if (!item) return { success: false }
      animatedHide()
      return launchAdminItem(item)
    },
    'launcher/uninstall': (_event, id) => {
      const item = findItem(id)
      if (!item) return { success: false }
      animatedHide()
      return uninstallItem(item)
    },
    'launcher/close-window': (_event, hwnd) => {
      animatedHide()
      exec(`powershell -NoProfile -Command "(New-Object -ComObject WScript.Shell).AppActivate([int]0); Add-Type -Name W -Namespace W -MemberDefinition '[DllImport(\\\"user32.dll\\\")] public static extern int PostMessage(IntPtr h,uint m,int w,int l);'; [W.W]::PostMessage([IntPtr]${hwnd}, 0x0010, 0, 0)"`)
      return { success: true }
    },
    'launcher/end-task': (_event, pid) => {
      animatedHide()
      try { process.kill(pid) } catch {}
      return { success: true }
    },
    'launcher/open-location': (_event, id) => openItemLocation(findItem(id)),
    'apps/catalog': () => index,
    'apps/launch': (_event, id) => launchItem(findItem(id)),
    'apps/launch-admin': (_event, id) => launchAdminItem(findItem(id)),
    'apps/app-open-location': (_event, id) => openItemLocation(findItem(id)),
    'apps/app-uninstall': (_event, id) => uninstallItem(findItem(id)),
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

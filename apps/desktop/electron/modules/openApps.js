const { execFile } = require('child_process')
const { app } = require('electron')
const os = require('os')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const koffi = require('koffi')
const appIcons = require('./appIcons')

let lastSnapshot = null

const TEMP = os.tmpdir()
const COMPILE_PS1 = path.join(TEMP, 'alpine_compile_filter.ps1')
const QUERY_PS1 = path.join(TEMP, 'alpine_query_apps.ps1')

let queryReady = false
let lastApps = null
let shellAppsProvider = null
let broadcastFn = null

const user32 = koffi.load('user32.dll')
const OPEN_APPS_WIN_EVENT_PROC = koffi.proto('__stdcall', 'OpenAppsWinEventProc', 'void', ['uintptr_t', 'uint32', 'uintptr_t', 'int32', 'int32', 'uint32', 'uint32'])
const SetWinEventHook = user32.func('__stdcall', 'SetWinEventHook', 'uintptr_t', ['uint32', 'uint32', 'uintptr_t', 'OpenAppsWinEventProc *', 'uint32', 'uint32', 'uint32'])
const UnhookWinEvent = user32.func('__stdcall', 'UnhookWinEvent', 'int', ['uintptr_t'])

const EVENT_OBJECT_CREATE = 0x8000
const EVENT_OBJECT_HIDE = 0x8003
const EVENT_OBJECT_NAMECHANGE = 0x800c
const WINEVENT_OUTOFCONTEXT = 0x0000
const WINEVENT_SKIPOWNPROCESS = 0x0002
const OBJID_WINDOW = 0
const CHILDID_SELF = 0

const REFRESH_DEBOUNCE_MS = 300
const BACKSTOP_INTERVAL_MS = 30000
const FALLBACK_POLL_MS = 2000

let winEventProcPointer = null
let lifecycleHookHandle = null
let nameChangeHookHandle = null
let refreshTimer = null
let backstopInterval = null
let refreshing = false
let refreshQueued = false

function toNum(v) {
  return typeof v === 'bigint' ? Number(v) : v
}

function withShellApps(apps) {
  const extras = shellAppsProvider ? shellAppsProvider() : []
  if (extras.length === 0) return apps
  const extraHwnds = new Set(extras.map((e) => e.hwnd))
  return [...extras, ...apps.filter((a) => !extraHwnds.has(a.hwnd))]
}

const CSHARP_FILTER_SOURCE =
  `using System;\n` +
  `using System.Text;\n` +
  `using System.Collections.Generic;\n` +
  `using System.Runtime.InteropServices;\n` +
  `public class TaskbarFilter {\n` +
  `    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);\n` +
  `    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lParam);\n` +
  `    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);\n` +
  `    [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr hWnd, int nIndex);\n` +
  `    [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);\n` +
  `    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder sb, int n);\n` +
  `    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);\n` +
  `    [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr hWnd, int a, out int v, int s);\n` +
  `    public static bool IsTaskbarWindow(IntPtr hWnd) {\n` +
  `        if (!IsWindowVisible(hWnd)) return false;\n` +
  `        if (GetWindowTextLength(hWnd) == 0) return false;\n` +
  `        int ex = GetWindowLong(hWnd, -20);\n` +
  `        if ((ex & 0x80) != 0) return false;\n` +
  `        if (GetWindowLong(hWnd, -8) != 0 && (ex & 0x40000) == 0) return false;\n` +
  `        int cloaked = 0; DwmGetWindowAttribute(hWnd, 14, out cloaked, 4);\n` +
  `        return cloaked == 0;\n` +
  `    }\n` +
  `    public static string GetTitle(IntPtr hWnd) {\n` +
  `        var sb = new StringBuilder(256); GetWindowText(hWnd, sb, 256); return sb.ToString();\n` +
  `    }\n` +
  `    public static object[][] GetTaskbarWindows() {\n` +
  `        var list = new List<object[]>();\n` +
  `        EnumWindows((h, _) => {\n` +
  `            if (IsTaskbarWindow(h)) { uint pid; GetWindowThreadProcessId(h, out pid); list.Add(new object[]{ h.ToInt64(), (long)pid, GetTitle(h) }); }\n` +
  `            return true;\n` +
  `        }, IntPtr.Zero);\n` +
  `        return list.ToArray();\n` +
  `    }\n` +
  `}\n`

function getFilterDllPathForHash(hash) {
  return path.join(TEMP, `alpine_taskbar_filter-${hash}.dll`)
}

function pruneStaleFilterDlls(keepDllPath) {
  try {
    for (const name of fs.readdirSync(TEMP)) {
      const full = path.join(TEMP, name)
      if (/^alpine_taskbar_filter-.*\.dll$/i.test(name) && full !== keepDllPath) {
        try { fs.unlinkSync(full) } catch {}
      }
    }
  } catch {}
}

function buildCompileScript(dllPath) {
  return (
    `Add-Type -Language CSharp -TypeDefinition @'\n` +
    CSHARP_FILTER_SOURCE +
    `'@ -OutputAssembly '${dllPath}'\n`
  )
}

function buildQueryScript(dllPath) {
  return (
    `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\n` +
    `Add-Type -Path '${dllPath}'\n` +
    `$wins = [TaskbarFilter]::GetTaskbarWindows()\n` +
    `$ids = @($wins | ForEach-Object { [int]$_[1] } | Select-Object -Unique)\n` +
    `$pids = @{}\n` +
    `if ($ids.Count -gt 0) { Get-Process -Id $ids -ErrorAction SilentlyContinue | ForEach-Object { $pids[$_.Id] = $_ } }\n` +
    `$r = @(foreach ($w in $wins) {\n` +
    `  $proc = $pids[[int]$w[1]]\n` +
    `  if ($proc) {\n` +
    `    $p = $null; try { $p = $proc.MainModule.FileName } catch {}\n` +
    `    if ($p) { [PSCustomObject]@{ id = [int]$w[1]; hwnd = $w[0]; name = $proc.ProcessName; title = [string]$w[2]; path = $p } }\n` +
    `  }\n` +
    `})\n` +
    `if ($r.Count -eq 0) { '[]' } else { $r | ConvertTo-Json -Compress }\n`
  )
}

async function compileDll() {
  const hash = crypto.createHash('sha256').update(CSHARP_FILTER_SOURCE).digest('hex').slice(0, 12)
  const dllPath = getFilterDllPathForHash(hash)

  if (fs.existsSync(dllPath)) {
    fs.writeFileSync(QUERY_PS1, buildQueryScript(dllPath), 'utf8')
    queryReady = true
    pruneStaleFilterDlls(dllPath)
    return
  }

  fs.writeFileSync(COMPILE_PS1, buildCompileScript(dllPath), 'utf8')

  await new Promise((resolve) => {
    execFile('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', COMPILE_PS1], resolve)
  })

  if (!fs.existsSync(dllPath)) return

  fs.writeFileSync(QUERY_PS1, buildQueryScript(dllPath), 'utf8')
  queryReady = true
  pruneStaleFilterDlls(dllPath)
}

async function parseApps(stdout) {
  if (!stdout || !stdout.trim()) return []

  let raw
  try { raw = JSON.parse(stdout.trim()) } catch { return [] }
  if (!Array.isArray(raw)) raw = [raw]

  const HIDDEN_NAMES = new Set(['powershell', 'conhost', 'cmd'])
  const SHELL_NAMES = new Set(['electron', 'alpine-shell', 'alpine shell'])
  const SHELL_DEFAULT_TITLE = 'alpine-shell'
  const shellPid = process.pid
  const candidates = raw.filter((p) => {
    if (!p.path || p.id === shellPid) return false
    const nameLower = p.name.toLowerCase()
    if (HIDDEN_NAMES.has(nameLower)) return false
    if (SHELL_NAMES.has(nameLower)) return p.title && p.title !== SHELL_DEFAULT_TITLE
    return true
  })

  const generic = await appIcons.ensureGenericIcon()
  const apps = await Promise.all(
    candidates.map(async (p) => {
      const icon = (await appIcons.iconForFile(p.path)) || generic
      const displayName = SHELL_NAMES.has(p.name.toLowerCase()) ? p.title : p.name
      return { id: p.id, hwnd: p.hwnd, name: displayName, title: p.title, path: p.path, icon }
    })
  )

  return apps
}

const FALLBACK_CMD =
  `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ` +
  `$r = Get-Process | Where-Object { $_.MainWindowTitle -ne '' } | ` +
  `ForEach-Object { $p = $null; try { $p = $_.MainModule.FileName } catch {}; ` +
  `[PSCustomObject]@{ id = $_.Id; hwnd = $_.MainWindowHandle.ToInt64(); name = $_.ProcessName; title = $_.MainWindowTitle; path = $p } } | ` +
  `ConvertTo-Json -Compress; if ($null -eq $r) { '[]' } else { $r }`

function getOpenApps() {
  return new Promise((resolve) => {
    if (queryReady) {
      execFile(
        'powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', QUERY_PS1],
        { maxBuffer: 1024 * 1024 },
        async (_, stdout) => resolve(await parseApps(stdout))
      )
    } else {
      execFile(
        'powershell', ['-NoProfile', '-Command', FALLBACK_CMD],
        { maxBuffer: 1024 * 1024 },
        async (_, stdout) => resolve(await parseApps(stdout))
      )
    }
  })
}

function snapshot(apps) {
  return JSON.stringify(apps.map((a) => ({ hwnd: a.hwnd, title: a.title })).sort((a, b) => a.hwnd - b.hwnd))
}

async function refreshOpenApps() {
  if (!broadcastFn) return
  if (refreshing) { refreshQueued = true; return }
  refreshing = true
  try {
    lastApps = await getOpenApps()
    const merged = withShellApps(lastApps)
    const current = snapshot(merged)
    if (current !== lastSnapshot) {
      lastSnapshot = current
      broadcastFn('windows/open-apps-changed', merged)
    }
  } finally {
    refreshing = false
    if (refreshQueued) {
      refreshQueued = false
      scheduleRefresh()
    }
  }
}

function scheduleRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => {
    refreshTimer = null
    refreshOpenApps()
  }, REFRESH_DEBOUNCE_MS)
}

function onWindowEvent(_hook, _event, _hwnd, idObject, idChild) {
  try {
    if (idObject !== OBJID_WINDOW || idChild !== CHILDID_SELF) return
    scheduleRefresh()
  } catch (e) {
    console.error('[openApps] win event error:', e?.message ?? e)
  }
}

function installWindowEventHooks() {
  try {
    winEventProcPointer = koffi.register(onWindowEvent, koffi.pointer(OPEN_APPS_WIN_EVENT_PROC))
    lifecycleHookHandle = SetWinEventHook(EVENT_OBJECT_CREATE, EVENT_OBJECT_HIDE, 0, winEventProcPointer, 0, 0, WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS)
    nameChangeHookHandle = SetWinEventHook(EVENT_OBJECT_NAMECHANGE, EVENT_OBJECT_NAMECHANGE, 0, winEventProcPointer, 0, 0, WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS)
    if (!toNum(lifecycleHookHandle) && !toNum(nameChangeHookHandle)) {
      uninstallWindowEventHooks()
      return false
    }
    return true
  } catch (e) {
    console.error('[openApps] win event hook install error:', e?.message ?? e)
    uninstallWindowEventHooks()
    return false
  }
}

function uninstallWindowEventHooks() {
  if (lifecycleHookHandle) {
    try { UnhookWinEvent(lifecycleHookHandle) } catch {}
    lifecycleHookHandle = null
  }
  if (nameChangeHookHandle) {
    try { UnhookWinEvent(nameChangeHookHandle) } catch {}
    nameChangeHookHandle = null
  }
  if (winEventProcPointer) {
    try { koffi.unregister(winEventProcPointer) } catch {}
    winEventProcPointer = null
  }
}

module.exports = {
  setShellAppsProvider(provider) {
    shellAppsProvider = provider
  },
  refresh() {
    if (!broadcastFn) return
    const merged = withShellApps(lastApps || [])
    lastSnapshot = snapshot(merged)
    broadcastFn('windows/open-apps-changed', merged)
  },
  handlers: {
    'windows/open-apps': async () => {
      if (lastApps === null) {
        lastApps = await getOpenApps()
      }
      const merged = withShellApps(lastApps)
      lastSnapshot = snapshot(merged)
      return merged
    },
  },
  start(broadcast) {
    broadcastFn = broadcast
    compileDll()
    refreshOpenApps()

    const hooked = installWindowEventHooks()
    backstopInterval = setInterval(refreshOpenApps, hooked ? BACKSTOP_INTERVAL_MS : FALLBACK_POLL_MS)

    app.on('will-quit', () => {
      uninstallWindowEventHooks()
      if (refreshTimer) clearTimeout(refreshTimer)
      if (backstopInterval) clearInterval(backstopInterval)
    })
  },
}

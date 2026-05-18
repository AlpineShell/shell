const { execFile } = require('child_process')
const { app } = require('electron')
const os = require('os')
const fs = require('fs')
const path = require('path')

const iconCache = new Map()
let lastSnapshot = null

const TEMP = os.tmpdir()
const DLL_PATH = path.join(TEMP, 'alpine_taskbar_filter.dll')
const COMPILE_PS1 = path.join(TEMP, 'alpine_compile_filter.ps1')
const QUERY_PS1 = path.join(TEMP, 'alpine_query_apps.ps1')

let queryReady = false
let lastApps = null

async function compileDll() {
  try { fs.unlinkSync(DLL_PATH) } catch {}
  const compileScript =
    `Add-Type -Language CSharp -TypeDefinition @'\n` +
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
    `}\n` +
    `'@ -OutputAssembly '${DLL_PATH}'\n`

  fs.writeFileSync(COMPILE_PS1, compileScript, 'utf8')

  await new Promise((resolve) => {
    execFile('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', COMPILE_PS1], resolve)
  })

  if (!fs.existsSync(DLL_PATH)) return

  const queryScript =
    `Add-Type -Path '${DLL_PATH}'\n` +
    `$wins = [TaskbarFilter]::GetTaskbarWindows()\n` +
    `$pids = @{}; Get-Process | ForEach-Object { $pids[$_.Id] = $_ }\n` +
    `$r = @(foreach ($w in $wins) {\n` +
    `  $proc = $pids[[int]$w[1]]\n` +
    `  if ($proc) {\n` +
    `    $p = $null; try { $p = $proc.MainModule.FileName } catch {}\n` +
    `    if ($p) { [PSCustomObject]@{ id = [int]$w[1]; hwnd = $w[0]; name = $proc.ProcessName; title = [string]$w[2]; path = $p } }\n` +
    `  }\n` +
    `})\n` +
    `if ($r.Count -eq 0) { '[]' } else { $r | ConvertTo-Json -Compress }\n`

  fs.writeFileSync(QUERY_PS1, queryScript, 'utf8')
  queryReady = true
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

  const apps = await Promise.all(
    candidates.map(async (p) => {
      const key = p.path.toLowerCase()
      if (!iconCache.has(key)) {
        try {
          const icon = await app.getFileIcon(p.path, { size: 'normal' })
          iconCache.set(key, icon.toDataURL())
        } catch {
          iconCache.set(key, null)
        }
      }
      const displayName = SHELL_NAMES.has(p.name.toLowerCase()) ? p.title : p.name
      return { id: p.id, hwnd: p.hwnd, name: displayName, title: p.title, path: p.path, icon: iconCache.get(key) }
    })
  )

  return apps.filter((a) => a.icon !== null)
}

const FALLBACK_CMD =
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

module.exports = {
  handlers: {
    'windows/open-apps': async () => {
      if (lastApps !== null) return lastApps
      const apps = await getOpenApps()
      lastApps = apps
      lastSnapshot = snapshot(apps)
      return apps
    },
  },
  start(broadcast) {
    compileDll()

    setInterval(async () => {
      const apps = await getOpenApps()
      const current = snapshot(apps)
      lastApps = apps
      if (current !== lastSnapshot) {
        lastSnapshot = current
        broadcast('windows/open-apps-changed', apps)
      }
    }, 2000)
  },
}

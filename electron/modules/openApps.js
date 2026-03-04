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

async function compileDll() {
  try { fs.unlinkSync(DLL_PATH) } catch {}
  const compileScript =
    `Add-Type -Language CSharp -TypeDefinition @'\n` +
    `using System;\n` +
    `using System.Runtime.InteropServices;\n` +
    `public class TaskbarFilter {\n` +
    `    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);\n` +
    `    [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr hWnd, int nIndex);\n` +
    `    [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr hWnd, int dwAttribute, out int pvAttribute, int cbAttribute);\n` +
    `    public static bool IsTaskbarVisible(IntPtr hWnd) {\n` +
    `        if (!IsWindowVisible(hWnd)) return false;\n` +
    `        if ((GetWindowLong(hWnd, -20) & 0x80) != 0) return false;\n` +
    `        int cloaked = 0;\n` +
    `        DwmGetWindowAttribute(hWnd, 14, out cloaked, 4);\n` +
    `        return cloaked == 0;\n` +
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
    `$r = Get-Process |\n` +
    `  Where-Object { $_.MainWindowHandle.ToInt64() -ne 0 -and [TaskbarFilter]::IsTaskbarVisible($_.MainWindowHandle) } |\n` +
    `  ForEach-Object {\n` +
    `    $p = $null; try { $p = $_.MainModule.FileName } catch {}\n` +
    `    [PSCustomObject]@{ id = $_.Id; name = $_.ProcessName; title = $_.MainWindowTitle; path = $p }\n` +
    `  } | ConvertTo-Json -Compress\n` +
    `if ($null -eq $r) { '[]' } else { $r }\n`

  fs.writeFileSync(QUERY_PS1, queryScript, 'utf8')
  queryReady = true
}

async function parseApps(stdout) {
  if (!stdout || !stdout.trim()) return []

  let raw
  try { raw = JSON.parse(stdout.trim()) } catch { return [] }
  if (!Array.isArray(raw)) raw = [raw]

  const shellPid = process.pid
  const candidates = raw.filter((p) => p.path && p.id !== shellPid)

  const seen = new Set()
  const unique = []
  for (const p of candidates) {
    const key = p.path.toLowerCase()
    if (!seen.has(key)) { seen.add(key); unique.push(p) }
  }

  const apps = await Promise.all(
    unique.map(async (p) => {
      const key = p.path.toLowerCase()
      if (!iconCache.has(key)) {
        try {
          const icon = await app.getFileIcon(p.path, { size: 'normal' })
          iconCache.set(key, icon.toDataURL())
        } catch {
          iconCache.set(key, null)
        }
      }
      return { id: p.id, name: p.name, title: p.title, path: p.path, icon: iconCache.get(key) }
    })
  )

  return apps.filter((a) => a.icon !== null)
}

const FALLBACK_CMD =
  `$r = Get-Process | Where-Object { $_.MainWindowTitle -ne '' } | ` +
  `ForEach-Object { $p = $null; try { $p = $_.MainModule.FileName } catch {}; ` +
  `[PSCustomObject]@{ id = $_.Id; name = $_.ProcessName; title = $_.MainWindowTitle; path = $p } } | ` +
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
  return JSON.stringify(apps.map((a) => ({ id: a.id, name: a.name })).sort((a, b) => a.id - b.id))
}

module.exports = {
  handlers: {
    'windows/open-apps': async () => {
      const apps = await getOpenApps()
      lastSnapshot = snapshot(apps)
      return apps
    },
  },
  start(broadcast) {
    compileDll()

    setInterval(async () => {
      const apps = await getOpenApps()
      const current = snapshot(apps)
      if (current !== lastSnapshot) {
        lastSnapshot = current
        broadcast('windows/open-apps-changed', apps)
      }
    }, 3000)
  },
}

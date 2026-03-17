const { execSync, exec } = require('child_process')
const { shell } = require('electron')
const path = require('path')
const fs = require('fs')

const RUN_KEYS = [
  'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run',
  'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run',
  'HKCU\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run',
  'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run',
]

const RUN_ONCE_KEYS = [
  'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\RunOnce',
  'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\RunOnce',
]

const STARTUP_FOLDERS = [
  path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup'),
  path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'StartUp'),
]

function isShellReplacement() {
  const hives = [
    'HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon',
    'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon',
  ]

  for (const hive of hives) {
    try {
      const result = execSync(`reg query "${hive}" /v Shell`, { windowsHide: true, encoding: 'utf8' })
      const match = result.match(/REG_SZ\s+(.+)/)
      if (!match) continue
      const shellValue = match[1].trim().toLowerCase()
      if (!shellValue.includes('explorer.exe')) return true
    } catch {
    }
  }

  return false
}

function expandEnvVars(str) {
  return str.replace(/%([^%]+)%/g, (_, key) => process.env[key] || `%${key}%`)
}

function getRunEntries(keys) {
  const entries = []

  for (const key of keys) {
    try {
      const result = execSync(`reg query "${key}"`, { windowsHide: true, encoding: 'utf8' })
      const lines = result.split('\n')

      for (const line of lines) {
        const match = line.match(/^\s+(\S+)\s+REG_(?:SZ|EXPAND_SZ)\s+(.+)/)
        if (!match) continue

        const name = match[1].trim()
        const value = expandEnvVars(match[2].trim())

        if (name.toLowerCase() === 'alpineshell') continue

        entries.push({ name, command: value, registryKey: key })
      }
    } catch {
    }
  }

  return entries
}

function deleteRunOnceEntry(registryKey, name) {
  try {
    execSync(`reg delete "${registryKey}" /v "${name}" /f`, { windowsHide: true, encoding: 'utf8' })
  } catch {
  }
}

function getStartupFolderEntries() {
  const entries = []

  for (const folder of STARTUP_FOLDERS) {
    try {
      if (!fs.existsSync(folder)) continue

      for (const file of fs.readdirSync(folder)) {
        const ext = path.extname(file).toLowerCase()
        if (ext === '.desktop.ini' || file.toLowerCase() === 'desktop.ini') continue

        const fullPath = path.join(folder, file)
        const stat = fs.statSync(fullPath)
        if (!stat.isFile()) continue

        if (ext === '.lnk' || ext === '.exe' || ext === '.bat' || ext === '.cmd' || ext === '.vbs') {
          entries.push({ name: path.basename(file, ext), command: fullPath, isShortcut: ext === '.lnk' })
        }
      }
    } catch {
    }
  }

  return entries
}

function launchMsixApps(entries) {
  if (entries.length === 0) return

  const launches = entries.map(e => `$pids += [AppLauncher]::Launch("${e.aumid}")`).join('\n')

  const script = `Add-Type -TypeDefinition @"
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Runtime.CompilerServices;
using System.Threading;

[ComImport, Guid("2e941141-7f97-4756-ba1d-9decde894a3d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IApplicationActivationManager {
    IntPtr ActivateApplication([In, MarshalAs(UnmanagedType.LPWStr)] string appUserModelId, [In, MarshalAs(UnmanagedType.LPWStr)] string arguments, [In] int options, [Out] out uint processId);
}

[ComImport, Guid("45BA127D-10A8-46EA-8AB7-56EA9078943C")]
class ApplicationActivationManager : IApplicationActivationManager {
    [MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
    public extern IntPtr ActivateApplication([In, MarshalAs(UnmanagedType.LPWStr)] string appUserModelId, [In, MarshalAs(UnmanagedType.LPWStr)] string arguments, [In] int options, [Out] out uint processId);
}

public class AppLauncher {
    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    public static uint Launch(string aumid) {
        var mgr = new ApplicationActivationManager();
        uint pid;
        mgr.ActivateApplication(aumid, null, 0, out pid);
        return pid;
    }

    public static void MinimizeByPid(uint pid) {
        try {
            var proc = Process.GetProcessById((int)pid);
            for (int i = 0; i < 20; i++) {
                if (proc.MainWindowHandle != IntPtr.Zero) {
                    ShowWindow(proc.MainWindowHandle, 2);
                    return;
                }
                Thread.Sleep(250);
                proc.Refresh();
            }
        } catch {}
    }
}
"@
$pids = @()
${launches}
Start-Sleep -Milliseconds 500
foreach ($p in $pids) {
    [AppLauncher]::MinimizeByPid($p)
}
`

  const tmpFile = path.join(process.env.TEMP || 'C:\\Windows\\Temp', 'alpine-msix-launch.ps1')
  fs.writeFileSync(tmpFile, script, 'utf8')

  exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tmpFile}"`, { windowsHide: true }, (err, stdout, stderr) => {
    fs.unlink(tmpFile, () => {})
    if (err) console.error('[autostart] Failed to launch MSIX apps:', err.message, stderr)
    else console.log('[autostart] MSIX apps launched:', stdout.trim())
  })
}

function launchEntry(entry) {
  try {
    if (entry.isShortcut) {
      shell.openPath(entry.command)
    } else {
      exec(entry.command, { windowsHide: false })
    }

    console.log(`[autostart] Launched: ${entry.name}`)
  } catch (e) {
    console.error(`[autostart] Failed to launch ${entry.name}:`, e.message)
  }
}

function getMsixStartupEntries() {
  const entries = []

  try {
    const script = `Get-AppxPackage | ForEach-Object {
  $pkg = $_
  try {
    $manifest = $pkg | Get-AppxPackageManifest
    $startupTasks = $manifest | Select-Xml -XPath '//*[local-name()="Extension"][@Category="windows.startupTask"]'
    foreach($task in $startupTasks) {
      if($task.Node.StartupTask.Enabled -eq 'true') {
        $apps = $manifest | Select-Xml -XPath '//*[local-name()="Application"]'
        $appId = $apps[0].Node.Id
        Write-Output "$($pkg.PackageFamilyName)!$appId|$($task.Node.StartupTask.DisplayName)"
      }
    }
  } catch {}
}
`

    const tmpFile = path.join(process.env.TEMP || 'C:\\Windows\\Temp', 'alpine-msix-query.ps1')
    fs.writeFileSync(tmpFile, script, 'utf8')

    const result = execSync(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${tmpFile}"`,
      { windowsHide: true, encoding: 'utf8', timeout: 30000 }
    )

    try { fs.unlinkSync(tmpFile) } catch {}

    for (const line of result.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue

      const [aumid, displayName] = trimmed.split('|')
      if (!aumid) continue

      const name = displayName || aumid.split('!')[0]

      entries.push({
        name,
        aumid,
        isMsix: true,
      })
    }
  } catch (e) {
    console.error('[autostart] Failed to query MSIX startup tasks:', e.message)
  }

  return entries
}

function getScheduledLogonTasks() {
  const entries = []

  try {
    const xml = execSync(
      'schtasks /query /xml ONE',
      { windowsHide: true, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
    )

    const taskBlocks = xml.split('<?xml')
    for (const block of taskBlocks) {
      if (!block.trim()) continue

      const hasLogonTrigger = /<LogonTrigger>/.test(block)
      if (!hasLogonTrigger) continue

      const isEnabled = !/<Enabled>false<\/Enabled>/i.test(block.split('</Settings>')[0] || '')

      if (!isEnabled) continue

      const commandMatch = block.match(/<Command>([^<]+)<\/Command>/)
      if (!commandMatch) continue

      const command = expandEnvVars(commandMatch[1].trim())
      const argsMatch = block.match(/<Arguments>([^<]+)<\/Arguments>/)
      const args = argsMatch ? expandEnvVars(argsMatch[1].trim()) : ''

      const uriMatch = block.match(/<URI>([^<]+)<\/URI>/)
      const name = uriMatch ? uriMatch[1].replace(/^\\/, '') : path.basename(command, '.exe')

      if (name.toLowerCase().includes('alpineshell')) continue

      const fullCommand = args ? `"${command}" ${args}` : `"${command}"`
      entries.push({ name, command: fullCommand })
    }
  } catch (e) {
    console.error('[autostart] Failed to query scheduled tasks:', e.message)
  }

  return entries
}

function processAutostart() {
  if (!isShellReplacement()) {
    console.log('[autostart] Not the registered shell, skipping autostart')
    return
  }

  console.log('[autostart] Alpine Shell is the default shell, processing startup entries...')

  const runEntries = getRunEntries(RUN_KEYS)
  const runOnceEntries = getRunEntries(RUN_ONCE_KEYS)
  const folderEntries = getStartupFolderEntries()
  const scheduledEntries = getScheduledLogonTasks()
  const msixEntries = getMsixStartupEntries()

  for (const entry of runOnceEntries) {
    deleteRunOnceEntry(entry.registryKey, entry.name)
  }

  const launchableEntries = [...runEntries, ...runOnceEntries, ...folderEntries, ...scheduledEntries]

  for (const entry of launchableEntries) {
    launchEntry(entry)
  }

  launchMsixApps(msixEntries)

  const total = launchableEntries.length + msixEntries.length
  console.log(`[autostart] Processed ${total} autostart entries (${runEntries.length} registry, ${runOnceEntries.length} run-once, ${folderEntries.length} startup folder, ${scheduledEntries.length} scheduled tasks, ${msixEntries.length} MSIX)`)
}

module.exports = { processAutostart }

const { app, shell } = require('electron')
const { execFile, spawn, execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

let cachedBuild = null
function getCurrentBuild() {
  if (cachedBuild != null) return cachedBuild
  try {
    const out = execSync('reg query "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion" /v CurrentBuildNumber', { windowsHide: true, encoding: 'utf8' })
    const match = out.match(/CurrentBuildNumber\s+REG_SZ\s+(\d+)/)
    cachedBuild = match ? parseInt(match[1], 10) : 0
  } catch {
    cachedBuild = 0
  }
  return cachedBuild
}

function classifyTier(isFeature, build) {
  if (!isFeature) return 'quality'
  if (build >= 26100) return 'enablement'
  return 'feature'
}

let state = {
  status: 'idle',
  updates: [],
  lastCheckedAt: null,
  rebootRequired: false,
  progressPercent: 0,
  progressLabel: null,
  installingId: null,
  error: null,
}

let broadcastRef = null

function setState(partial) {
  state = { ...state, ...partial }
  broadcastRef?.('windows-update/state-changed', state)
}

function searchWindowsUpdates() {
  const script =
    "$ProgressPreference='SilentlyContinue'; $session = New-Object -ComObject Microsoft.Update.Session; $searcher = $session.CreateUpdateSearcher(); $result = $searcher.Search(\"IsInstalled=0 and Type='Software'\"); $items = @(); foreach ($u in $result.Updates) { $kb = @($u.KBArticleIDs) -join ','; $cat = @($u.Categories | ForEach-Object { $_.Name }); $items += [pscustomobject]@{ title = $u.Title; kb = $kb; sizeBytes = [int64]$u.MaxDownloadSize; updateId = $u.Identity.UpdateID; isFeature = [bool]($cat -contains 'Upgrades') } }; $items | ConvertTo-Json -Compress"

  return new Promise((resolve, reject) => {
    execFile(
      'powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { maxBuffer: 4 * 1024 * 1024, timeout: 120000 },
      (err, stdout) => {
        if (err) return reject(new Error(err.message))

        const trimmed = (stdout || '').trim()
        if (!trimmed) return resolve([])

        let parsed
        try {
          parsed = JSON.parse(trimmed)
        } catch (e) {
          return reject(new Error(e.message))
        }

        const list = Array.isArray(parsed) ? parsed : [parsed]
        const build = getCurrentBuild()
        const items = list.map((item) => {
          const isFeature = !!item.isFeature
          return {
            title: typeof item.title === 'string' ? item.title : String(item.title ?? ''),
            kb: item.kb && item.kb.length ? item.kb : null,
            sizeBytes: Number(item.sizeBytes) || 0,
            updateId: item.updateId ? String(item.updateId) : '',
            isFeatureUpdate: isFeature,
            tier: classifyTier(isFeature, build),
          }
        })

        resolve(items)
      }
    )
  })
}

function getProgressFilePath() {
  return path.join(app.getPath('userData'), 'windows-update-progress.json')
}

function toPowerShellSingleQuotedLiteral(value) {
  return "'" + value.replace(/'/g, "''") + "'"
}

function buildInstallScript(progressFilePath, targetUpdateId) {
  const progressLiteral = toPowerShellSingleQuotedLiteral(progressFilePath)
  const idLiteral = toPowerShellSingleQuotedLiteral(targetUpdateId || '')
  return [
    "$ErrorActionPreference = 'Stop'",
    "$ProgressPreference = 'SilentlyContinue'",
    '$progressPath = ' + progressLiteral,
    '$targetId = ' + idLiteral,
    'function Write-Progress-Record($record) {',
    '  $json = $record | ConvertTo-Json -Compress',
    '  $tmp = $progressPath + ".tmp"',
    '  Set-Content -Path $tmp -Value $json -Encoding UTF8',
    '  Move-Item -Path $tmp -Destination $progressPath -Force',
    '}',
    "$cs = @'",
    'using System;',
    'using System.Runtime.InteropServices;',
    'namespace AlpineWu {',
    '  [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("8F45ABF1-F9AE-4B95-A933-F0F66E5056EA")]',
    '  public interface IDownloadProgressChangedCallback { void Invoke([MarshalAs(UnmanagedType.IUnknown)] object j, [MarshalAs(UnmanagedType.IUnknown)] object a); }',
    '  [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("77254866-9F5B-4C8E-B9E2-C77A8530D64B")]',
    '  public interface IDownloadCompletedCallback { void Invoke([MarshalAs(UnmanagedType.IUnknown)] object j, [MarshalAs(UnmanagedType.IUnknown)] object a); }',
    '  [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("E01402D5-F8DA-43BA-A012-38894BD048F1")]',
    '  public interface IInstallationProgressChangedCallback { void Invoke([MarshalAs(UnmanagedType.IUnknown)] object j, [MarshalAs(UnmanagedType.IUnknown)] object a); }',
    '  [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("45F4F6F3-D602-4F98-9A8A-3EFA152AD2D3")]',
    '  public interface IInstallationCompletedCallback { void Invoke([MarshalAs(UnmanagedType.IUnknown)] object j, [MarshalAs(UnmanagedType.IUnknown)] object a); }',
    '  public class DlCb : IDownloadProgressChangedCallback, IDownloadCompletedCallback { public void Invoke(object j, object a) { } }',
    '  public class InCb : IInstallationProgressChangedCallback, IInstallationCompletedCallback { public void Invoke(object j, object a) { } }',
    '}',
    "'@",
    'try {',
    '  $session = New-Object -ComObject Microsoft.Update.Session',
    '  $searcher = $session.CreateUpdateSearcher()',
    '  $result = $searcher.Search("IsInstalled=0 and Type=\'Software\'")',
    '  $toInstall = New-Object -ComObject Microsoft.Update.UpdateColl',
    '  foreach ($u in $result.Updates) {',
    '    if ($targetId -ne "" -and $u.Identity.UpdateID -ne $targetId) { continue }',
    '    if (-not $u.EulaAccepted) { $u.AcceptEula() }',
    '    $toInstall.Add($u) | Out-Null',
    '  }',
    '  $total = $toInstall.Count',
    '  if ($total -eq 0) {',
    "    Write-Progress-Record @{ phase = 'up-to-date'; percent = 100; index = 0; total = 0; title = $null; rebootRequired = $false; error = $null }",
    '    exit 0',
    '  }',
    '  $reboot = $false',
    '  $useAsync = $true',
    '  try { Add-Type -TypeDefinition $cs -ErrorAction Stop } catch { $useAsync = $false }',
    '  if ($useAsync) {',
    '    try {',
    '      $dlcb = New-Object AlpineWu.DlCb',
    '      $incb = New-Object AlpineWu.InCb',
    '      $downloader = $session.CreateUpdateDownloader()',
    '      $downloader.Updates = $toInstall',
    '      $djob = $downloader.BeginDownload($dlcb, $dlcb, $null)',
    '      while (-not $djob.IsCompleted) {',
    '        Start-Sleep -Milliseconds 700',
    '        $pr = $djob.GetProgress()',
    '        $ci = [int]$pr.CurrentUpdateIndex',
    '        $t = if ($ci -ge 0 -and $ci -lt $total) { $toInstall.Item($ci).Title } else { $null }',
    '        $pct = [int]([math]::Floor([double]$pr.PercentComplete / 2))',
    "        Write-Progress-Record @{ phase = 'downloading'; percent = $pct; index = ($ci + 1); total = $total; title = $t; rebootRequired = $false; error = $null }",
    '      }',
    '      $downloader.EndDownload($djob) | Out-Null',
    '      $installer = $session.CreateUpdateInstaller()',
    '      $installer.Updates = $toInstall',
    '      $ijob = $installer.BeginInstall($incb, $incb, $null)',
    '      while (-not $ijob.IsCompleted) {',
    '        Start-Sleep -Milliseconds 700',
    '        $pr = $ijob.GetProgress()',
    '        $ci = [int]$pr.CurrentUpdateIndex',
    '        $t = if ($ci -ge 0 -and $ci -lt $total) { $toInstall.Item($ci).Title } else { $null }',
    '        $pct = [int](50 + [math]::Floor([double]$pr.PercentComplete / 2))',
    "        Write-Progress-Record @{ phase = 'installing'; percent = $pct; index = ($ci + 1); total = $total; title = $t; rebootRequired = $false; error = $null }",
    '      }',
    '      $ires = $installer.EndInstall($ijob)',
    '      try { $installer.Commit(0) } catch {}',
    '      $reboot = [bool]$ires.RebootRequired',
    '    } catch { $useAsync = $false }',
    '  }',
    '  if (-not $useAsync) {',
    '    for ($i = 0; $i -lt $total; $i++) {',
    '      $u = $toInstall.Item($i)',
    '      $one = New-Object -ComObject Microsoft.Update.UpdateColl',
    '      $one.Add($u) | Out-Null',
    '      $percent = [int](($i / ($total * 2)) * 100)',
    "      Write-Progress-Record @{ phase = 'downloading'; percent = $percent; index = ($i + 1); total = $total; title = $u.Title; rebootRequired = $false; error = $null }",
    '      $downloader = $session.CreateUpdateDownloader()',
    '      $downloader.Updates = $one',
    '      $downloader.Download() | Out-Null',
    '    }',
    '    for ($i = 0; $i -lt $total; $i++) {',
    '      $u = $toInstall.Item($i)',
    '      $one = New-Object -ComObject Microsoft.Update.UpdateColl',
    '      $one.Add($u) | Out-Null',
    '      $percent = [int]((($total + $i) / ($total * 2)) * 100)',
    "      Write-Progress-Record @{ phase = 'installing'; percent = $percent; index = ($i + 1); total = $total; title = $u.Title; rebootRequired = $false; error = $null }",
    '      $installer = $session.CreateUpdateInstaller()',
    '      $installer.Updates = $one',
    '      $installResult = $installer.Install()',
    '      if ($installResult.RebootRequired) { $reboot = $true }',
    '    }',
    '    try { $installer.Commit(0) } catch {}',
    '  }',
    '  if ($reboot) {',

    "    Write-Progress-Record @{ phase = 'restart-required'; percent = 100; index = $total; total = $total; title = $null; rebootRequired = $true; error = $null }",
    '  } else {',
    "    Write-Progress-Record @{ phase = 'installed'; percent = 100; index = $total; total = $total; title = $null; rebootRequired = $false; error = $null }",
    '  }',
    '  exit 0',
    '} catch {',
    "  Write-Progress-Record @{ phase = 'error'; percent = 0; index = 0; total = 0; title = $null; rebootRequired = $false; error = $_.Exception.Message }",
    '  exit 1',
    '}',
  ].join('\n')
}

function progressLabelFor(record, verb) {
  if (record && record.total > 1 && record.index) return `${verb} update ${record.index} of ${record.total}`
  if (record && record.title) return `${verb} ${record.title}`
  return `${verb}…`
}

function mapPhaseToState(record) {
  const phase = record && record.phase
  const percent = record && typeof record.percent === 'number' ? record.percent : 0
  if (phase === 'downloading') return { status: 'downloading', progressPercent: percent, progressLabel: progressLabelFor(record, 'Downloading'), error: null }
  if (phase === 'installing') return { status: 'installing', progressPercent: percent, progressLabel: progressLabelFor(record, 'Installing'), error: null }
  if (phase === 'up-to-date') return { status: 'up-to-date', updates: [], progressPercent: 100, progressLabel: null, installingId: null, rebootRequired: false, error: null }
  if (phase === 'installed') return { status: 'installed', updates: [], progressPercent: 100, progressLabel: null, installingId: null, rebootRequired: false, error: null }
  if (phase === 'restart-required') return { status: 'restart-required', progressPercent: 100, progressLabel: null, installingId: null, rebootRequired: true, error: null }
  if (phase === 'error') {
    return {
      status: 'error',
      progressLabel: null,
      installingId: null,
      error: record && record.error ? String(record.error) : 'Windows update installation failed.',
    }
  }
  return null
}

function isTerminalPhase(phase) {
  return phase === 'installed' || phase === 'up-to-date' || phase === 'restart-required' || phase === 'error'
}

function deleteFileQuietly(filePath) {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  } catch (e) {}
}

function startInstall(targetUpdateId) {
  const progressFilePath = getProgressFilePath()
  deleteFileQuietly(progressFilePath)

  const script = buildInstallScript(progressFilePath, targetUpdateId)
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  const launcher =
    'Start-Process powershell -Verb RunAs -WindowStyle Hidden -Wait -ArgumentList "-NoProfile -WindowStyle Hidden -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ' +
    encoded +
    '"'

  setState({ status: 'downloading', progressPercent: 0, progressLabel: 'Preparing…', installingId: targetUpdateId || null, error: null })

  let terminalObserved = false
  let pollInterval = null
  let safetyTimeout = null
  let lastKey = null

  const finish = () => {
    if (pollInterval) clearInterval(pollInterval)
    if (safetyTimeout) clearTimeout(safetyTimeout)
    pollInterval = null
    safetyTimeout = null
    deleteFileQuietly(progressFilePath)
  }

  const readProgress = () => {
    let record = null
    try {
      if (!fs.existsSync(progressFilePath)) return
      const raw = fs.readFileSync(progressFilePath, 'utf8').trim()
      if (!raw) return
      record = JSON.parse(raw)
    } catch (e) {
      return
    }

    if (!record) return
    const key = `${record.phase}:${record.index ?? ''}:${record.percent ?? ''}`
    if (key === lastKey) return
    lastKey = key

    const next = mapPhaseToState(record)
    if (next) setState(next)

    if (isTerminalPhase(record.phase)) {
      terminalObserved = true
      finish()
    }
  }

  pollInterval = setInterval(readProgress, 1000)

  safetyTimeout = setTimeout(() => {
    readProgress()
    if (!terminalObserved) {
      setState({
        status: 'error',
        installingId: null,
        error: 'Update timed out before completing.',
      })
    }
    finish()
  }, 60 * 60 * 1000)

  const child = spawn(
    'powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', launcher],
    { windowsHide: true }
  )

  child.on('error', () => {
    if (!terminalObserved) {
      setState({
        status: 'error',
        installingId: null,
        error: 'Update was cancelled or could not run with administrator rights.',
      })
    }
    finish()
  })

  child.on('exit', () => {
    readProgress()
    if (terminalObserved) return
    setTimeout(() => {
      readProgress()
      if (terminalObserved) return
      setState({
        status: 'error',
        installingId: null,
        error: 'Update was cancelled or could not run with administrator rights.',
      })
      finish()
    }, 250)
  })
}

function readUpdateLogs() {
  const script =
    "$ErrorActionPreference='SilentlyContinue'; $e = Get-WinEvent -FilterHashtable @{ LogName = 'Microsoft-Windows-WindowsUpdateClient/Operational' } -MaxEvents 50; $e | ForEach-Object { [pscustomobject]@{ time = $_.TimeCreated.ToString('o'); id = $_.Id; level = $_.LevelDisplayName; message = $_.Message } } | ConvertTo-Json -Compress"

  return new Promise((resolve) => {
    execFile(
      'powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { maxBuffer: 8 * 1024 * 1024, timeout: 30000 },
      (err, stdout) => {
        if (err) return resolve([])
        let parsed = []
        try { parsed = JSON.parse((stdout || '').trim() || '[]') } catch { return resolve([]) }
        if (!Array.isArray(parsed)) parsed = [parsed]
        resolve(
          parsed.map((entry) => ({
            time: entry.time ? Date.parse(entry.time) : Date.now(),
            id: Number(entry.id) || 0,
            level: typeof entry.level === 'string' ? entry.level : '',
            message: String(entry.message ?? '').split('\n')[0].trim(),
          }))
        )
      }
    )
  })
}

module.exports = {
  handlers: {
    'windows-update/get-state': () => state,
    'windows-update/open-windows-update': () => {
      try { shell.openExternal('ms-settings:windowsupdate') } catch {}
      return { ok: true }
    },
    'windows-update/logs': () => readUpdateLogs(),
    'windows-update/check': async () => {
      if (state.status === 'checking' || state.status === 'downloading' || state.status === 'installing') {
        return state
      }
      setState({ status: 'checking', error: null })
      try {
        const items = await searchWindowsUpdates()
        setState({
          status: items.length ? 'available' : 'up-to-date',
          updates: items,
          lastCheckedAt: Date.now(),
          error: null,
        })
      } catch (e) {
        setState({ status: 'error', error: e.message, lastCheckedAt: Date.now() })
      }
      return state
    },
    'windows-update/install': (_event, payload) => {
      if (state.status === 'checking' || state.status === 'downloading' || state.status === 'installing') {
        return state
      }
      const id = payload && payload.updateId
      const target = state.updates.find((u) => u.updateId === id)
      if (target && target.tier === 'feature') {
        return state
      }
      startInstall(id)
      return state
    },
  },

  start(broadcast) {
    broadcastRef = broadcast
  },
}

const { app } = require('electron')
const { execFile, spawn } = require('child_process')
const path = require('path')
const fs = require('fs')

let state = {
  status: 'idle',
  updates: [],
  lastCheckedAt: null,
  rebootRequired: false,
  error: null,
}

let broadcastRef = null

function setState(partial) {
  state = { ...state, ...partial }
  broadcastRef?.('windows-update/state-changed', state)
}

function searchWindowsUpdates() {
  const script =
    "$ProgressPreference='SilentlyContinue'; $session = New-Object -ComObject Microsoft.Update.Session; $searcher = $session.CreateUpdateSearcher(); $result = $searcher.Search(\"IsInstalled=0 and Type='Software'\"); $items = @(); foreach ($u in $result.Updates) { $kb = @($u.KBArticleIDs) -join ','; $items += [pscustomobject]@{ title = $u.Title; kb = $kb; sizeBytes = [int64]$u.MaxDownloadSize } }; $items | ConvertTo-Json -Compress"

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
        const items = list.map((item) => ({
          title: typeof item.title === 'string' ? item.title : String(item.title ?? ''),
          kb: item.kb && item.kb.length ? item.kb : null,
          sizeBytes: Number(item.sizeBytes) || 0,
        }))

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

function buildInstallScript(progressFilePath) {
  const progressLiteral = toPowerShellSingleQuotedLiteral(progressFilePath)
  return [
    "$ErrorActionPreference = 'Stop'",
    "$ProgressPreference = 'SilentlyContinue'",
    '$progressPath = ' + progressLiteral,
    'function Write-Progress-Record($record) {',
    '  $json = $record | ConvertTo-Json -Compress',
    '  $tmp = $progressPath + ".tmp"',
    '  Set-Content -Path $tmp -Value $json -Encoding UTF8',
    '  Move-Item -Path $tmp -Destination $progressPath -Force',
    '}',
    'try {',
    '  $session = New-Object -ComObject Microsoft.Update.Session',
    '  $searcher = $session.CreateUpdateSearcher()',
    '  $result = $searcher.Search("IsInstalled=0 and Type=\'Software\'")',
    '  $toInstall = New-Object -ComObject Microsoft.Update.UpdateColl',
    '  foreach ($u in $result.Updates) {',
    '    if (-not $u.EulaAccepted) { $u.AcceptEula() }',
    '    $toInstall.Add($u) | Out-Null',
    '  }',
    '  if ($toInstall.Count -eq 0) {',
    "    Write-Progress-Record @{ phase = 'up-to-date'; rebootRequired = $false; error = $null }",
    '    exit 0',
    '  }',
    "  Write-Progress-Record @{ phase = 'downloading'; rebootRequired = $false; error = $null }",
    '  $downloader = $session.CreateUpdateDownloader()',
    '  $downloader.Updates = $toInstall',
    '  $downloader.Download() | Out-Null',
    "  Write-Progress-Record @{ phase = 'installing'; rebootRequired = $false; error = $null }",
    '  $installer = $session.CreateUpdateInstaller()',
    '  $installer.Updates = $toInstall',
    '  $installResult = $installer.Install()',
    '  $reboot = [bool]$installResult.RebootRequired',
    "  if ($reboot) {",
    "    Write-Progress-Record @{ phase = 'restart-required'; rebootRequired = $true; error = $null }",
    '  } else {',
    "    Write-Progress-Record @{ phase = 'installed'; rebootRequired = $false; error = $null }",
    '  }',
    '  exit 0',
    '} catch {',
    "  Write-Progress-Record @{ phase = 'error'; rebootRequired = $false; error = $_.Exception.Message }",
    '  exit 1',
    '}',
  ].join('\n')
}

function mapPhaseToState(record) {
  const phase = record && record.phase
  if (phase === 'downloading') return { status: 'downloading', error: null }
  if (phase === 'installing') return { status: 'installing', error: null }
  if (phase === 'up-to-date') return { status: 'up-to-date', updates: [], rebootRequired: false, error: null }
  if (phase === 'installed') return { status: 'installed', updates: [], rebootRequired: false, error: null }
  if (phase === 'restart-required') return { status: 'restart-required', rebootRequired: true, error: null }
  if (phase === 'error') {
    return {
      status: 'error',
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

function startInstall() {
  const progressFilePath = getProgressFilePath()
  deleteFileQuietly(progressFilePath)

  const script = buildInstallScript(progressFilePath)
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  const launcher =
    'Start-Process powershell -Verb RunAs -Wait -ArgumentList "-NoProfile -ExecutionPolicy Bypass -EncodedCommand ' +
    encoded +
    '"'

  setState({ status: 'downloading', error: null })

  let terminalObserved = false
  let pollInterval = null
  let safetyTimeout = null
  let lastPhase = null

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

    if (!record || record.phase === lastPhase) return
    lastPhase = record.phase

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
        error: 'Update was cancelled or could not run with administrator rights.',
      })
      finish()
    }, 250)
  })
}

module.exports = {
  handlers: {
    'windows-update/get-state': () => state,
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
    'windows-update/install': () => {
      if (state.status === 'checking' || state.status === 'downloading' || state.status === 'installing') {
        return state
      }
      startInstall()
      return state
    },
  },

  start(broadcast) {
    broadcastRef = broadcast
  },
}

const { shell } = require('electron')
const { execFile } = require('child_process')

let state = {
  status: 'idle',
  updates: [],
  lastCheckedAt: null,
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

module.exports = {
  handlers: {
    'windows-update/get-state': () => state,
    'windows-update/check': async () => {
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
    'windows-update/open-settings': () => {
      shell.openExternal('ms-settings:windowsupdate').catch(() => {})
      return undefined
    },
  },

  start(broadcast) {
    broadcastRef = broadcast
  },
}

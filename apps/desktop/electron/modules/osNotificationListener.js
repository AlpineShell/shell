const { spawn } = require('child_process')
const { app } = require('electron')
const path = require('path')
const notifications = require('./notifications')

const APP_USER_MODEL_ID = 'AlpineShell.Desktop'

const scriptsDir = app.isPackaged
  ? path.join(process.resourcesPath, 'scripts')
  : path.join(__dirname, '..', 'scripts')
const scriptPath = path.join(scriptsDir, 'notificationListener.ps1')

let proc = null
let stopped = true
let buf = ''
let restartTimer = null
let accessDenied = false

function mapAccess(status) {
  if (status === 'Allowed') return 'granted'
  if (status === 'Denied') return 'denied'
  return 'unavailable'
}

function handleLine(line) {
  const text = line.trim()
  if (!text) return
  let msg
  try { msg = JSON.parse(text) } catch { return }
  if (msg.type === 'access') {
    const mapped = mapAccess(msg.status)
    accessDenied = mapped !== 'granted'
    notifications.setOsAccessStatus(mapped)
    return
  }
  if (msg.type === 'notification') {
    notifications.post({
      source: 'os',
      appName: msg.appName || 'Notification',
      title: msg.title || '',
      body: msg.body || '',
      osId: typeof msg.id === 'number' ? msg.id : undefined,
    })
  }
}

function start() {
  if (proc) return
  stopped = false
  accessDenied = false
  buf = ''
  try {
    proc = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', scriptPath], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch (e) {
    console.error('[osNotifications] spawn error:', e.message)
    notifications.setOsAccessStatus('unavailable')
    proc = null
    return
  }

  proc.stdout.on('data', (chunk) => {
    buf += chunk.toString()
    let idx
    while ((idx = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, idx)
      buf = buf.slice(idx + 1)
      handleLine(line)
    }
  })

  proc.on('error', (e) => console.error('[osNotifications] process error:', e.message))

  proc.on('exit', () => {
    proc = null
    if (stopped || accessDenied) return
    if (restartTimer) clearTimeout(restartTimer)
    restartTimer = setTimeout(() => { if (!stopped) start() }, 5000)
  })
}

function stop() {
  stopped = true
  if (restartTimer) { clearTimeout(restartTimer); restartTimer = null }
  if (proc) {
    try { proc.kill() } catch (e) { console.error('[osNotifications] kill error:', e.message) }
    proc = null
  }
}

module.exports = {
  start() {
    try { app.setAppUserModelId(APP_USER_MODEL_ID) } catch (e) { console.error('[osNotifications] setAppUserModelId error:', e.message) }
    notifications.setOsControl({ start, stop })
    if (notifications.getConfig().captureOsToasts) start()
    app.on('will-quit', stop)
  },
}

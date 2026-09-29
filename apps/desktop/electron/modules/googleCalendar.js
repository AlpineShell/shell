const { app, shell, safeStorage } = require('electron')
const path = require('path')
const fs = require('fs')
const http = require('http')
const crypto = require('crypto')
const { loadLicenceConfig } = require('../licenceConfig')

const STORE_FILE = 'google-calendar.json'
const AUTH_SERVICE_BASE = loadLicenceConfig().authBase
const CALENDAR_BASE = 'https://www.googleapis.com'
const TASKS_BASE = 'https://tasks.googleapis.com'
const POLL_INTERVAL_MS = 5 * 60 * 1000
const AUTH_TIMEOUT_MS = 5 * 60 * 1000
const FETCH_DAYS = 3
const DEFAULT_EVENT_COLOR = '#3f51b5'

const MODERN_EVENT_COLORS = {
  '1': '#7986cb', '2': '#33b679', '3': '#8e24aa', '4': '#e67c73',
  '5': '#f6bf26', '6': '#f4511e', '7': '#039be5', '8': '#616161',
  '9': '#3f51b5', '10': '#0b8043', '11': '#d50000',
}

const MODERN_CALENDAR_COLORS = {
  '1': '#795548', '2': '#e67c73', '3': '#d50000', '4': '#f4511e',
  '5': '#ef6c00', '6': '#f09300', '7': '#009688', '8': '#0b8043',
  '9': '#7cb342', '10': '#c0ca33', '11': '#e4c441', '12': '#f6bf26',
  '13': '#33b679', '14': '#039be5', '15': '#4285f4', '16': '#3f51b5',
  '17': '#7986cb', '18': '#b39ddb', '19': '#616161', '20': '#a79b8e',
  '21': '#ad1457', '22': '#d81b60', '23': '#8e24aa', '24': '#9e69af',
}

let storePath = null
let broadcast = null

let refreshToken = null
let accountEmail = null
let connected = false
let connecting = false
let lastError = null

let accessToken = null
let accessTokenExpiry = 0

let events = []
let tasks = []
let fetchedAt = null

let refreshing = false
let pendingRefresh = false
let dataGeneration = 0
let lastRange = null

function getStorePath() {
  if (!storePath) storePath = path.join(app.getPath('userData'), STORE_FILE)
  return storePath
}

function base64url(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function persist() {
  try {
    const payload = JSON.stringify({ refreshToken, email: accountEmail })
    const dir = path.dirname(getStorePath())
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    if (safeStorage.isEncryptionAvailable()) {
      fs.writeFileSync(getStorePath(), safeStorage.encryptString(payload), { mode: 0o600 })
    } else {
      fs.writeFileSync(getStorePath(), payload, { encoding: 'utf8', mode: 0o600 })
    }
  } catch (e) {
    console.error('[googleCalendar] persist error:', e.message)
  }
}

function load() {
  try {
    const file = getStorePath()
    if (!fs.existsSync(file)) return
    const raw = fs.readFileSync(file)
    let text
    if (safeStorage.isEncryptionAvailable()) {
      try {
        text = safeStorage.decryptString(raw)
      } catch {
        text = raw.toString('utf8')
      }
    } else {
      text = raw.toString('utf8')
    }
    const data = JSON.parse(text)
    const issuedByRetiredDesktopClient = typeof data.clientId === 'string'
    if (typeof data.refreshToken === 'string' && !issuedByRetiredDesktopClient) refreshToken = data.refreshToken
    if (typeof data.email === 'string' && refreshToken) accountEmail = data.email
    connected = !!refreshToken
  } catch (e) {
    console.error('[googleCalendar] load error:', e.message)
  }
}

function getState() {
  return {
    connected,
    email: accountEmail,
    connecting,
    error: lastError,
  }
}

function getData() {
  return { events, tasks, fetchedAt, error: lastError }
}

function broadcastState() {
  if (broadcast) broadcast('calendar/state-changed', getState())
}

function broadcastData() {
  if (broadcast) broadcast('calendar/data-changed', getData())
}

function startOfToday() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

function addDays(date, count) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + count)
}

const CALLBACK_HTML = '<!doctype html><html><head><meta charset="utf-8"><title>Alpine Shell</title></head><body style="font-family:system-ui;background:#111;color:#eee;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><h2 style="font-weight:600">You can close this tab</h2><p style="opacity:.6">Alpine Shell is now connected to Google Calendar.</p></div></body></html>'

function createLoopbackServer(expectedState) {
  let resolveHandoff
  let rejectHandoff
  const handoffPromise = new Promise((resolve, reject) => {
    resolveHandoff = resolve
    rejectHandoff = reject
  })
  handoffPromise.catch(() => {})
  let settled = false
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    const handoff = url.searchParams.get('handoff')
    const returnedState = url.searchParams.get('state')
    const error = url.searchParams.get('error')
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(CALLBACK_HTML)
    if (settled) return
    if (error) return finish(() => rejectHandoff(new Error(error)))
    if (!handoff || returnedState !== expectedState) return finish(() => rejectHandoff(new Error('invalid-callback')))
    finish(() => resolveHandoff(handoff))
  })
  const timer = setTimeout(() => finish(() => rejectHandoff(new Error('timeout'))), AUTH_TIMEOUT_MS)
  function finish(action) {
    if (settled) return
    settled = true
    clearTimeout(timer)
    try { server.close() } catch { void 0 }
    action()
  }
  function close() {
    finish(() => rejectHandoff(new Error('aborted')))
  }
  server.on('error', (e) => finish(() => rejectHandoff(e)))
  const listening = new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port))
    server.once('error', reject)
  })
  return { handoffPromise, listening, close }
}

async function postToAuthService(route, payload) {
  const res = await fetch(`${AUTH_SERVICE_BASE}/google-calendar/${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const body = await res.json().catch(() => ({}))
  return { status: res.status, ok: res.ok, body }
}

async function redeemHandoff(handoff, verifier) {
  const { ok, status, body } = await postToAuthService('token', { handoff, code_verifier: verifier })
  if (!ok) throw new Error(`token-exchange-failed:${status}`)
  return body
}

async function refreshAccessToken() {
  if (!refreshToken) throw new Error('not-connected')
  const { ok, status, body } = await postToAuthService('refresh', { refresh_token: refreshToken })
  if (status === 401) {
    expireSession()
    throw new Error('session-expired')
  }
  if (!ok) throw new Error(`token-refresh-failed:${status}`)
  accessToken = body.access_token
  accessTokenExpiry = Date.now() + (Number(body.expires_in) || 3600) * 1000
  if (body.refresh_token) {
    refreshToken = body.refresh_token
    persist()
  }
  return accessToken
}

async function ensureAccessToken() {
  if (accessToken && Date.now() < accessTokenExpiry - 60000) return accessToken
  return refreshAccessToken()
}

async function apiError(res) {
  let detail = ''
  try {
    const body = await res.json()
    detail = body?.error?.message || body?.error?.errors?.[0]?.message || ''
  } catch { void 0 }
  return new Error(`api-${res.status}${detail ? `: ${detail}` : ''}`)
}

async function api(base, pathAndQuery, token) {
  const res = await fetch(base + pathAndQuery, { headers: { Authorization: `Bearer ${token}` } })
  if (res.status === 401) {
    const fresh = await refreshAccessToken()
    const retry = await fetch(base + pathAndQuery, { headers: { Authorization: `Bearer ${fresh}` } })
    if (!retry.ok) throw await apiError(retry)
    return retry.json()
  }
  if (!res.ok) throw await apiError(res)
  return res.json()
}

async function fetchCalendarEvents(token, timeMin, timeMax) {
  const list = await api(CALENDAR_BASE, '/calendar/v3/users/me/calendarList', token)
  const calendars = (list.items || []).filter((c) => c.selected !== false)
  const perCalendar = await Promise.all(
    calendars.map(async (cal) => {
      const calendarColor = (cal.colorId && MODERN_CALENDAR_COLORS[cal.colorId]) || cal.backgroundColor || DEFAULT_EVENT_COLOR
      const query = new URLSearchParams({
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '250',
      })
      try {
        const data = await api(CALENDAR_BASE, `/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events?${query}`, token)
        return (data.items || [])
          .filter((ev) => ev.status !== 'cancelled' && (ev.start?.dateTime || ev.start?.date))
          .map((ev) => {
            const allDay = !!ev.start.date
            const eventColor = (ev.colorId && MODERN_EVENT_COLORS[ev.colorId]) || null
            return {
              id: `${cal.id}:${ev.id}`,
              calendarId: cal.id,
              title: ev.summary || '(No title)',
              description: ev.description || null,
              location: ev.location || null,
              start: ev.start.dateTime || ev.start.date,
              end: ev.end?.dateTime || ev.end?.date || ev.start.dateTime || ev.start.date,
              allDay,
              color: eventColor || calendarColor,
            }
          })
      } catch (e) {
        console.error('[googleCalendar] events fetch error:', cal.id, e.message)
        return []
      }
    })
  )
  return perCalendar.flat()
}

async function fetchTasks(token, timeMax) {
  const lists = await api(TASKS_BASE, '/tasks/v1/users/@me/lists', token)
  const perList = await Promise.all(
    (lists.items || []).map(async (list) => {
      const query = new URLSearchParams({ showCompleted: 'false', maxResults: '100' })
      try {
        const data = await api(TASKS_BASE, `/tasks/v1/lists/${encodeURIComponent(list.id)}/tasks?${query}`, token)
        return (data.items || [])
          .filter((task) => task.due && task.status !== 'completed' && new Date(task.due) < timeMax)
          .map((task) => ({
            id: `${list.id}:${task.id}`,
            title: task.title || '(No title)',
            due: task.due,
            completed: task.status === 'completed',
            listTitle: list.title || null,
          }))
      } catch (e) {
        console.error('[googleCalendar] tasks fetch error:', list.id, e.message)
        return []
      }
    })
  )
  return perList.flat()
}

async function refreshData(range) {
  if (range) lastRange = range
  if (!connected) return getData()
  if (refreshing) {
    pendingRefresh = true
    return getData()
  }
  refreshing = true
  const generation = dataGeneration
  let stale = false
  try {
    const token = await ensureAccessToken()
    const base = startOfToday()
    const startOffset = lastRange && Number.isFinite(lastRange.startOffset) ? lastRange.startOffset : 0
    const dayCount = lastRange && Number.isFinite(lastRange.dayCount) ? lastRange.dayCount : FETCH_DAYS
    const timeMin = addDays(base, Math.min(0, startOffset))
    const timeMax = addDays(base, Math.max(FETCH_DAYS, startOffset + dayCount))
    const [eventsResult, tasksResult] = await Promise.allSettled([
      fetchCalendarEvents(token, timeMin, timeMax),
      fetchTasks(token, timeMax),
    ])
    if (generation !== dataGeneration) stale = true
    else {
      if (eventsResult.status === 'fulfilled') events = eventsResult.value
      if (tasksResult.status === 'fulfilled') tasks = tasksResult.value
      fetchedAt = Date.now()
      const failures = []
      if (eventsResult.status === 'rejected') failures.push(`events ${eventsResult.reason?.message || 'failed'}`)
      if (tasksResult.status === 'rejected') failures.push(`tasks ${tasksResult.reason?.message || 'failed'}`)
      lastError = failures.length ? failures.join('; ') : null
      if (failures.length) console.error('[googleCalendar] refresh partial failure:', lastError)
      else console.log(`[googleCalendar] refreshed ${events.length} events, ${tasks.length} tasks`)
    }
  } catch (e) {
    if (generation !== dataGeneration) stale = true
    else {
      lastError = e.message
      console.error('[googleCalendar] refresh error:', e.message)
    }
  } finally {
    refreshing = false
  }
  if (!stale) {
    broadcastData()
    broadcastState()
  }
  if (pendingRefresh) {
    pendingRefresh = false
    return refreshData()
  }
  return getData()
}

async function connect() {
  if (connecting) return getState()
  connecting = true
  lastError = null
  broadcastState()

  const verifier = base64url(crypto.randomBytes(32))
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest())
  const expectedState = base64url(crypto.randomBytes(16))

  let closeServer = () => {}
  try {
    const server = createLoopbackServer(expectedState)
    closeServer = server.close
    const port = await server.listening
    const connectParams = new URLSearchParams({ port: String(port), state: expectedState, code_challenge: challenge })
    await shell.openExternal(`${AUTH_SERVICE_BASE}/google-calendar/connect?${connectParams}`)
    const handoff = await server.handoffPromise
    const tokenSet = await redeemHandoff(handoff, verifier)
    accessToken = tokenSet.access_token
    accessTokenExpiry = Date.now() + (Number(tokenSet.expires_in) || 3600) * 1000
    if (tokenSet.refresh_token) refreshToken = tokenSet.refresh_token
    if (tokenSet.email) accountEmail = tokenSet.email
    connected = !!refreshToken
    lastError = connected ? null : 'no-refresh-token'
    dataGeneration++
    persist()
  } catch (e) {
    lastError = e.message
    console.error('[googleCalendar] connect error:', e.message)
  } finally {
    closeServer()
    connecting = false
    broadcastState()
  }

  if (connected) refreshData()
  return getState()
}

function clearSession() {
  dataGeneration++
  refreshToken = null
  accessToken = null
  accessTokenExpiry = 0
  accountEmail = null
  connected = false
  lastError = null
  events = []
  tasks = []
  fetchedAt = null
}

function expireSession() {
  clearSession()
  lastError = 'session-expired'
  persist()
  broadcastState()
  broadcastData()
}

function disconnect() {
  clearSession()
  persist()
  broadcastState()
  broadcastData()
  return getState()
}

module.exports = {
  handlers: {
    'calendar/state-get': () => getState(),
    'calendar/data-get': () => getData(),
    'calendar/connect': () => connect(),
    'calendar/disconnect': () => disconnect(),
    'calendar/refresh': (_event, range) => refreshData(range),
  },
  start(b) {
    broadcast = b
    load()
    if (connected) refreshData()
    setInterval(() => { if (connected) refreshData() }, POLL_INTERVAL_MS)
  },
}

const os = require('os')
const path = require('path')
const fs = require('fs')
const plugins = require('./plugins')

const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage'
const CREDENTIALS_FILE = path.join(os.homedir(), '.claude', '.credentials.json')
const REFRESH_MS = 60 * 1000

let broadcast = null
let timer = null
let current = emptyUsage()

function emptyUsage() {
  return {
    ok: false,
    sessionPercent: 0,
    sessionResetsAtMs: null,
    weeklyPercent: 0,
    weeklyResetsAtMs: null,
    subscriptionType: null,
    updatedAtMs: 0,
  }
}

function readOAuth() {
  try {
    const parsed = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf8'))
    return parsed.claudeAiOauth || null
  } catch {
    return null
  }
}

function sessionPercentFrom(data) {
  if (data.five_hour && typeof data.five_hour.utilization === 'number') return data.five_hour.utilization
  if (Array.isArray(data.limits)) {
    const session = data.limits.find((l) => l && l.kind === 'session')
    if (session && typeof session.percent === 'number') return session.percent
  }
  return 0
}

function resetMs(section) {
  const value = section && section.resets_at ? Date.parse(section.resets_at) : NaN
  return Number.isFinite(value) ? value : null
}

async function fetchUsage() {
  const oauth = readOAuth()
  if (!oauth || !oauth.accessToken) return null
  let res
  try {
    res = await fetch(USAGE_URL, {
      headers: {
        Authorization: 'Bearer ' + oauth.accessToken,
        'anthropic-beta': 'oauth-2025-04-20',
        'anthropic-version': '2023-06-01',
        'User-Agent': 'alpine-shell',
      },
    })
  } catch {
    return null
  }
  if (!res.ok) return null
  let data
  try {
    data = await res.json()
  } catch {
    return null
  }
  return {
    ok: true,
    sessionPercent: sessionPercentFrom(data),
    sessionResetsAtMs: resetMs(data.five_hour),
    weeklyPercent: data.seven_day && typeof data.seven_day.utilization === 'number' ? data.seven_day.utilization : 0,
    weeklyResetsAtMs: resetMs(data.seven_day),
    subscriptionType: oauth.subscriptionType || null,
    updatedAtMs: Date.now(),
  }
}

async function refresh() {
  const next = await fetchUsage()
  if (next) {
    current = next
    if (broadcast) broadcast('plugins/data', { channel: 'claude-usage', data: current })
  }
}

module.exports = {
  handlers: {
    'claude-usage/get': () => current,
  },

  start(b) {
    broadcast = b
    plugins.registerPluginCapability('claude-usage', () => current)
    refresh()
    timer = setInterval(refresh, REFRESH_MS)
  },
}

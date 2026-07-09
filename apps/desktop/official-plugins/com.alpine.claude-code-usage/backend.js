// Backend for the Claude Code Usage plugin. Runs in an isolated Electron utilityProcess
// (started by the shell only when this plugin is installed + enabled). It reads the local
// Claude Code credentials, polls the Anthropic usage endpoint, and publishes the result on
// the `claude-usage` channel that the plugin's topbar widget subscribes to.

const os = require('os')
const path = require('path')
const fs = require('fs')

const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage'
const CREDENTIALS_FILE = path.join(os.homedir(), '.claude', '.credentials.json')

function emptyUsage() {
  return {
    ok: false,
    sessionPercent: 0,
    sessionResetsAtMs: null,
    limits: [],
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

function resetMs(value) {
  const ms = value ? Date.parse(value) : NaN
  return Number.isFinite(ms) ? ms : null
}

function labelForLimit(limit) {
  if (limit.kind === 'session') return 'Session · 5h'
  if (limit.kind === 'weekly_all') return 'Weekly'
  if (limit.kind === 'weekly_scoped') {
    const model = limit.scope && limit.scope.model && limit.scope.model.display_name
    return model ? 'Weekly · ' + model : 'Weekly · scoped'
  }
  return limit.kind || 'Limit'
}

function mapLimits(data) {
  const raw = Array.isArray(data.limits) ? data.limits : []
  const limits = raw.map((limit) => ({
    key:
      (limit.kind || 'limit') +
      (limit.scope && limit.scope.model && limit.scope.model.display_name ? ':' + limit.scope.model.display_name : ''),
    label: labelForLimit(limit),
    percent: typeof limit.percent === 'number' ? limit.percent : 0,
    resetsAtMs: resetMs(limit.resets_at),
    severity: limit.severity || 'normal',
  }))
  const extra = data.extra_usage
  if (extra && extra.is_enabled && typeof extra.utilization === 'number') {
    limits.push({ key: 'extra', label: 'Extra usage', percent: extra.utilization, resetsAtMs: null, severity: 'normal' })
  }
  return limits
}

function sessionPercentFrom(data, limits) {
  if (data.five_hour && typeof data.five_hour.utilization === 'number') return data.five_hour.utilization
  const session = limits.find((l) => l.key.split(':')[0] === 'session')
  return session ? session.percent : 0
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
  const limits = mapLimits(data)
  return {
    ok: true,
    sessionPercent: sessionPercentFrom(data, limits),
    sessionResetsAtMs: resetMs(data.five_hour && data.five_hour.resets_at),
    limits,
    subscriptionType: oauth.subscriptionType || null,
    updatedAtMs: Date.now(),
  }
}

module.exports = (ctx) => ctx.poll('claude-usage', fetchUsage, 60000)

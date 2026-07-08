const os = require('os')
const path = require('path')
const fs = require('fs')
const plugins = require('./plugins')

const HOUR_MS = 60 * 60 * 1000
const BLOCK_MS = 5 * HOUR_MS
const LOOKBACK_MS = 6 * HOUR_MS
const REFRESH_MS = 30 * 1000

const PRICING = {
  opus: { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  sonnet: { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  haiku: { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
}

const DEFAULT_BUDGET_USD = 25

let broadcast = null
let timer = null
let current = emptyUsage()

function emptyUsage() {
  return {
    blockTokens: 0,
    blockCost: 0,
    blockStartMs: null,
    blockEndMs: null,
    blockActive: false,
    todayTokens: 0,
    todayCost: 0,
    budgetUsd: DEFAULT_BUDGET_USD,
    models: [],
    updatedAtMs: 0,
  }
}

function projectsDir() {
  return path.join(os.homedir(), '.claude', 'projects')
}

function pricingFor(model) {
  const id = String(model || '').toLowerCase()
  if (id.includes('opus')) return PRICING.opus
  if (id.includes('haiku')) return PRICING.haiku
  return PRICING.sonnet
}

function tokensOf(usage) {
  return (
    (usage.input_tokens || 0) +
    (usage.output_tokens || 0) +
    (usage.cache_creation_input_tokens || 0) +
    (usage.cache_read_input_tokens || 0)
  )
}

function costOf(usage, model) {
  const rate = pricingFor(model)
  return (
    ((usage.input_tokens || 0) * rate.input +
      (usage.output_tokens || 0) * rate.output +
      (usage.cache_creation_input_tokens || 0) * rate.cacheWrite +
      (usage.cache_read_input_tokens || 0) * rate.cacheRead) /
    1_000_000
  )
}

function floorHour(ms) {
  return Math.floor(ms / HOUR_MS) * HOUR_MS
}

async function recentTranscriptFiles(cutoffMs) {
  const root = projectsDir()
  let dirs = []
  try {
    dirs = await fs.promises.readdir(root, { withFileTypes: true })
  } catch {
    return []
  }
  const files = []
  for (const dir of dirs) {
    if (!dir.isDirectory()) continue
    const dirPath = path.join(root, dir.name)
    let entries = []
    try {
      entries = await fs.promises.readdir(dirPath, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue
      const filePath = path.join(dirPath, entry.name)
      try {
        const stat = await fs.promises.stat(filePath)
        if (stat.mtimeMs >= cutoffMs) files.push(filePath)
      } catch {
        /* skip */
      }
    }
  }
  return files
}

async function collectEntries(cutoffMs) {
  const files = await recentTranscriptFiles(cutoffMs)
  const seen = new Set()
  const entries = []
  for (const filePath of files) {
    let raw
    try {
      raw = await fs.promises.readFile(filePath, 'utf8')
    } catch {
      continue
    }
    for (const line of raw.split('\n')) {
      if (!line || line[0] !== '{') continue
      let event
      try {
        event = JSON.parse(line)
      } catch {
        continue
      }
      if (event.type !== 'assistant' || !event.message || !event.message.usage) continue
      if (event.message.model === '<synthetic>') continue
      const ts = Date.parse(event.timestamp)
      if (!Number.isFinite(ts)) continue
      const dedupeKey = `${event.message.id || event.uuid}:${event.requestId || ''}`
      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)
      entries.push({ ts, model: event.message.model, usage: event.message.usage })
    }
  }
  entries.sort((a, b) => a.ts - b.ts)
  return entries
}

function activeBlockBounds(entries, now) {
  let blockStart = null
  let lastTs = null
  for (const entry of entries) {
    if (blockStart === null || entry.ts - blockStart >= BLOCK_MS || entry.ts - lastTs >= BLOCK_MS) {
      blockStart = floorHour(entry.ts)
    }
    lastTs = entry.ts
  }
  if (blockStart === null) return null
  const blockEnd = blockStart + BLOCK_MS
  return { blockStart, blockEnd, active: now < blockEnd }
}

function startOfLocalDay(now) {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

async function compute() {
  const now = Date.now()
  const dayStart = startOfLocalDay(now)
  const cutoff = Math.min(dayStart, now - LOOKBACK_MS)
  const entries = await collectEntries(cutoff)
  const usage = emptyUsage()
  usage.updatedAtMs = now

  const bounds = activeBlockBounds(entries, now)
  const modelTotals = new Map()

  for (const entry of entries) {
    const tokens = tokensOf(entry.usage)
    const cost = costOf(entry.usage, entry.model)
    if (entry.ts >= dayStart) {
      usage.todayTokens += tokens
      usage.todayCost += cost
    }
    if (bounds && entry.ts >= bounds.blockStart && entry.ts < bounds.blockEnd) {
      usage.blockTokens += tokens
      usage.blockCost += cost
      const key = entry.model || 'unknown'
      const acc = modelTotals.get(key) || { tokens: 0, cost: 0 }
      acc.tokens += tokens
      acc.cost += cost
      modelTotals.set(key, acc)
    }
  }

  if (bounds) {
    usage.blockStartMs = bounds.blockStart
    usage.blockEndMs = bounds.blockEnd
    usage.blockActive = bounds.active
  }
  usage.models = [...modelTotals.entries()]
    .map(([model, acc]) => ({ model, tokens: acc.tokens, cost: acc.cost }))
    .sort((a, b) => b.cost - a.cost)
  return usage
}

async function refresh() {
  try {
    current = await compute()
  } catch (e) {
    console.error('[claude-usage] compute error:', e.message)
    return
  }
  if (broadcast) broadcast('plugins/data', { channel: 'claude-usage', data: current })
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

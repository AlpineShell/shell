const fs = require('fs')
const path = require('path')
const {
  PLUGIN_API_VERSION,
  isSupportedApiVersion,
  satisfiesRange,
  MARKETPLACE_CATEGORIES,
  isSemver,
} = require('@alpine/plugin-sdk')

const CATEGORY_SET = new Set(MARKETPLACE_CATEGORIES)
const CONTRIBUTION_KEYS = ['topbarWidgets', 'settingsPages', 'launcherCommands', 'backendModules']

function arr(value) {
  return Array.isArray(value) ? value : []
}

function confinedFile(realBase, rel) {
  if (typeof rel !== 'string' || !rel || path.isAbsolute(rel)) return null
  if (rel.split(/[\\/]/).includes('..')) return null
  const target = path.resolve(realBase, rel)
  let lst
  try {
    lst = fs.lstatSync(target)
  } catch {
    return null
  }
  if (lst.isSymbolicLink()) return null
  let real
  try {
    real = fs.realpathSync(target)
  } catch {
    return null
  }
  if (real !== realBase && !real.startsWith(realBase + path.sep)) return null
  let st
  try {
    st = fs.statSync(real)
  } catch {
    return null
  }
  return st.isFile() ? real : null
}

function validateContributions(raw, apiVersion, push) {
  const out = {}
  if (!raw || typeof raw !== 'object') return out
  for (const key of CONTRIBUTION_KEYS) {
    const list = arr(raw[key])
    const kept = []
    for (const c of list) {
      if (!c || typeof c !== 'object') {
        push(`contributes.${key}: each item must be an object`)
        continue
      }
      if (c.export != null && (typeof c.export !== 'string' || !c.export)) {
        push(`contributes.${key}: 'export' must be a non-empty string`)
        continue
      }
      if (typeof c.since === 'number' && c.since > apiVersion) continue
      if (key === 'topbarWidgets' && !['left', 'center', 'right'].includes(c.slot)) {
        push(`contributes.topbarWidgets: invalid slot '${c.slot}'`)
        continue
      }
      if (key === 'launcherCommands' && !['action', 'provider'].includes(c.kind)) {
        push(`contributes.launcherCommands: invalid kind '${c.kind}'`)
        continue
      }
      kept.push({ ...c, export: c.export || 'default' })
    }
    if (kept.length) out[key] = kept
  }
  return out
}

function validateMarketplace(raw, realBase, push) {
  if (!raw || typeof raw !== 'object') return null
  const out = {}
  if (typeof raw.displayName === 'string') out.displayName = raw.displayName
  if (typeof raw.shortDescription === 'string') {
    if (raw.shortDescription.length > 120) push('marketplace.shortDescription: exceeds 120 chars')
    out.shortDescription = raw.shortDescription.slice(0, 120)
  }
  if (typeof raw.logo === 'string') {
    if (confinedFile(realBase, raw.logo)) out.logo = raw.logo
    else push('marketplace.logo: missing/escapes plugin dir')
  }
  if (typeof raw.readme === 'string') {
    if (confinedFile(realBase, raw.readme)) out.readme = raw.readme
    else push('marketplace.readme: missing/escapes plugin dir')
  }
  if (Array.isArray(raw.screenshots)) {
    const shots = []
    for (const s of raw.screenshots) {
      if (!s || typeof s.src !== 'string') continue
      if (confinedFile(realBase, s.src)) shots.push({ src: s.src, caption: typeof s.caption === 'string' ? s.caption : undefined, dark: !!s.dark })
      else push(`marketplace.screenshots: '${s.src}' missing/escapes`)
    }
    if (shots.length) out.screenshots = shots
  }
  if (typeof raw.category === 'string') {
    if (CATEGORY_SET.has(raw.category)) out.category = raw.category
    else push(`marketplace.category: unknown '${raw.category}'`)
  }
  if (Array.isArray(raw.keywords)) out.keywords = raw.keywords.filter((k) => typeof k === 'string')
  return out
}

function invalidRecord(raw, folderName, preset, errors) {
  return {
    id: String(folderName).toLowerCase(),
    name: typeof raw.name === 'string' && raw.name ? raw.name : folderName,
    version: '0.0.0',
    apiVersion: PLUGIN_API_VERSION,
    renderer: null,
    entry: null,
    main: null,
    hasBackend: false,
    icon: null,
    description: null,
    author: null,
    homepage: null,
    repository: null,
    license: null,
    engines: null,
    contributes: {},
    marketplace: null,
    preset: !!preset,
    legacy: false,
    verified: false,
    compat: { apiOk: true, engineOk: true, reason: null },
    valid: false,
    errors,
  }
}

function parseManifest(pluginDir, folderName, options) {
  const opts = options || {}
  const preset = !!opts.preset
  const appVersion = opts.appVersion

  let realBase
  try {
    realBase = fs.realpathSync(pluginDir)
  } catch {
    return { ok: false, record: invalidRecord({}, folderName, preset, ['plugin dir unreadable']) }
  }

  let raw
  try {
    raw = JSON.parse(fs.readFileSync(path.join(realBase, 'plugin.json'), 'utf8'))
  } catch (e) {
    return { ok: false, record: invalidRecord({}, folderName, preset, ['plugin.json parse: ' + e.message]) }
  }

  const errors = []
  const push = (m) => errors.push(m)

  const normalizedFolder = String(folderName).toLowerCase()
  let id = normalizedFolder
  if (raw.id != null) {
    id = String(raw.id)
    if (id.toLowerCase() !== normalizedFolder) push('id: must equal folder name')
  }

  if (!isSemver(raw.version)) push('version: not semver 2.0.0')

  let apiVersion = PLUGIN_API_VERSION
  if (raw.apiVersion != null) {
    if (!Number.isInteger(raw.apiVersion)) push('apiVersion: must be an integer')
    else apiVersion = raw.apiVersion
  }

  const compat = { apiOk: raw.apiVersion == null || isSupportedApiVersion(apiVersion), engineOk: true, reason: null }
  const range = raw.engines && raw.engines.alpineShell
  if (range && appVersion && !satisfiesRange(appVersion, range)) {
    compat.engineOk = false
    compat.reason = `requires Alpine ${range}`
  }
  if (!compat.apiOk) compat.reason = 'requires a newer Alpine'

  const renderer = raw.renderer != null ? raw.renderer : 'index.js'
  const rendererPath = confinedFile(realBase, renderer)
  if (!rendererPath) push('renderer: missing or escapes plugin dir')
  const mainPath = raw.main != null ? confinedFile(realBase, raw.main) : null
  if (raw.main != null && !mainPath) push('main: missing or escapes plugin dir')

  let icon = null
  if (typeof raw.icon === 'string') {
    if (raw.icon.startsWith('lucide:')) icon = raw.icon
    else if (confinedFile(realBase, raw.icon)) icon = raw.icon
    else push('icon: missing/escapes plugin dir')
  }

  const contributes = validateContributions(raw.contributes, apiVersion, push)
  const marketplace = validateMarketplace(raw.marketplace, realBase, push)

  const record = {
    id,
    name: typeof raw.name === 'string' && raw.name ? raw.name : folderName,
    version: raw.version,
    apiVersion,
    renderer,
    entry: renderer,
    main: raw.main || null,
    hasBackend: !!raw.main,
    icon,
    description: raw.description || null,
    author: raw.author || null,
    homepage: raw.homepage || null,
    repository: raw.repository || null,
    license: raw.license || null,
    engines: raw.engines || null,
    contributes,
    marketplace,
    preset,
    legacy: false,
    verified: false,
    compat,
    valid: errors.length === 0,
    errors,
  }
  return { ok: errors.length === 0, record }
}

module.exports = { parseManifest }

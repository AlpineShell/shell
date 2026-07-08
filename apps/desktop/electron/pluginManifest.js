const fs = require('fs')
const path = require('path')
const {
  PLUGIN_ID_PATTERN,
  PLUGIN_PERMISSIONS,
  isSupportedApiVersion,
  satisfiesRange,
  MARKETPLACE_CATEGORIES,
  isHttpsOrigin,
  isSemver,
} = require('@alpine/plugin-sdk')

const PERMISSION_SET = new Set(PLUGIN_PERMISSIONS)
const CATEGORY_SET = new Set(MARKETPLACE_CATEGORIES)
const CONTRIBUTION_KEYS = ['topbarWidgets', 'desktopWidgets', 'settingsPages', 'launcherCommands', 'backendModules']

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
      if (!c || typeof c.export !== 'string' || !c.export) {
        push(`contributes.${key}: each item needs a string 'export'`)
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
      kept.push(c)
    }
    if (kept.length) out[key] = kept
  }
  return out
}

function validateMarketplace(raw, realBase, permissions, optionalPermissions, push) {
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
  if (raw.permissionRationale && typeof raw.permissionRationale === 'object') {
    const declared = new Set([...permissions, ...optionalPermissions])
    const rationale = {}
    for (const [perm, text] of Object.entries(raw.permissionRationale)) {
      if (!declared.has(perm)) push(`marketplace.permissionRationale: '${perm}' is not a declared permission`)
      else if (typeof text === 'string') rationale[perm] = text
    }
    if (Object.keys(rationale).length) out.permissionRationale = rationale
  }
  return out
}

function legacyRecord(realBase, raw, folderName, preset) {
  const entry = typeof raw.entry === 'string' && raw.entry ? raw.entry : 'index.js'
  return {
    id: folderName,
    name: typeof raw.name === 'string' && raw.name ? raw.name : folderName,
    version: '0.0.0',
    apiVersion: 1,
    renderer: entry,
    entry,
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
    permissions: [],
    optionalPermissions: [],
    network: { connect: [] },
    marketplace: null,
    preset: !!preset,
    legacy: true,
    verified: false,
    compat: { apiOk: true, engineOk: true, reason: null },
    valid: true,
    errors: [],
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
    return { ok: false, record: { ...legacyRecord(pluginDir, {}, folderName, preset), valid: false, errors: ['plugin dir unreadable'] } }
  }

  let raw
  try {
    raw = JSON.parse(fs.readFileSync(path.join(realBase, 'plugin.json'), 'utf8'))
  } catch (e) {
    return { ok: false, record: { ...legacyRecord(realBase, {}, folderName, preset), valid: false, errors: ['plugin.json parse: ' + e.message] } }
  }

  if (raw.id == null && (raw.entry != null || raw.renderer == null)) {
    return { ok: true, record: legacyRecord(realBase, raw, folderName, preset) }
  }

  const errors = []
  const push = (m) => errors.push(m)

  const id = String(raw.id || '')
  if (!PLUGIN_ID_PATTERN.test(id)) push('id: not reverse-DNS lowercase')
  if (id.toLowerCase() !== String(folderName).toLowerCase()) push('id: must equal folder name')
  if (!isSemver(raw.version)) push('version: not semver 2.0.0')
  if (!Number.isInteger(raw.apiVersion)) push('apiVersion: must be an integer')

  const compat = { apiOk: isSupportedApiVersion(raw.apiVersion), engineOk: true, reason: null }
  const range = raw.engines && raw.engines.alpineShell
  if (range && appVersion && !satisfiesRange(appVersion, range)) {
    compat.engineOk = false
    compat.reason = `requires Alpine ${range}`
  }
  if (!compat.apiOk) compat.reason = 'requires a newer Alpine'

  const rendererPath = raw.renderer != null ? confinedFile(realBase, raw.renderer) : null
  if (raw.renderer != null && !rendererPath) push('renderer: missing or escapes plugin dir')
  const mainPath = raw.main != null ? confinedFile(realBase, raw.main) : null
  if (raw.main != null && !mainPath) push('main: missing or escapes plugin dir')

  let icon = null
  if (typeof raw.icon === 'string') {
    if (raw.icon.startsWith('lucide:')) icon = raw.icon
    else if (confinedFile(realBase, raw.icon)) icon = raw.icon
    else push('icon: missing/escapes plugin dir')
  }

  const permissions = arr(raw.permissions).filter((p) => {
    const ok = PERMISSION_SET.has(p)
    if (!ok) push(`permissions: unknown '${p}'`)
    return ok
  })
  const optionalPermissions = arr(raw.optionalPermissions).filter((p) => {
    const ok = PERMISSION_SET.has(p)
    if (!ok) push(`optionalPermissions: unknown '${p}'`)
    return ok
  })

  const connect = arr(raw.network && raw.network.connect).filter((o) => {
    const ok = isHttpsOrigin(o)
    if (!ok) push(`network.connect: invalid origin '${o}'`)
    return ok
  })
  const wantsFetch = permissions.includes('net:fetch') || optionalPermissions.includes('net:fetch')
  if (wantsFetch && connect.length === 0) push('net:fetch requires at least one network.connect origin')
  if (!wantsFetch && connect.length > 0) push('network.connect present without net:fetch permission')

  const contributes = validateContributions(raw.contributes, raw.apiVersion, push)
  const marketplace = validateMarketplace(raw.marketplace, realBase, permissions, optionalPermissions, push)

  const record = {
    id,
    name: typeof raw.name === 'string' && raw.name ? raw.name : folderName,
    version: raw.version,
    apiVersion: raw.apiVersion,
    renderer: raw.renderer || null,
    entry: raw.renderer || null,
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
    permissions,
    optionalPermissions,
    network: { connect },
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

const LANGUAGE_TAG = /^[a-zA-Z]{2,8}(?:-[a-zA-Z0-9]{1,8}){0,4}$/
const KLID = /^[0-9a-fA-F]{8}$/
const LANG_ID = /^[0-9a-fA-F]{4}$/
const GUID_PAIR = /^\{[0-9a-fA-F-]{36}\}\{[0-9a-fA-F-]{36}\}$/
const BIDI_MARK_CODES = [0x200e, 0x200f]

const SWITCH_HOTKEYS = { 1: 'alt-shift', 2: 'ctrl-shift', 3: 'grave', 4: 'none' }
const MAX_ENTRIES = 64

function isValidLanguageTag(tag) {
  return typeof tag === 'string' && tag.length <= 64 && LANGUAGE_TAG.test(tag)
}

function isValidKlid(klid) {
  return typeof klid === 'string' && KLID.test(klid)
}

function isValidInputMethodTip(tip) {
  if (typeof tip !== 'string' || tip.length > 128) return false
  const separator = tip.indexOf(':')
  if (separator === -1) return false
  const langId = tip.slice(0, separator)
  const rest = tip.slice(separator + 1)
  if (!LANG_ID.test(langId)) return false
  return KLID.test(rest) || GUID_PAIR.test(rest)
}

function normalizeKlid(klid) {
  return typeof klid === 'string' && klid ? klid.toLowerCase() : null
}

function splitInputMethodTip(tip) {
  if (!isValidInputMethodTip(tip)) return null
  const separator = tip.indexOf(':')
  const langId = tip.slice(0, separator).toLowerCase()
  const rest = tip.slice(separator + 1)
  const isIme = rest.charAt(0) === '{'
  return { langId, kind: isIme ? 'ime' : 'layout', klid: isIme ? null : rest.toLowerCase() }
}

function klidToLayoutWord(klid) {
  const normalized = normalizeKlid(klid)
  if (!normalized || !KLID.test(normalized)) return null
  if (normalized.slice(0, 4) !== '0000') return null
  return parseInt(normalized.slice(4), 16)
}

function hklToKlid(hkl) {
  const value = Number(hkl) >>> 0
  const high = (value >>> 16) & 0xffff
  if ((high & 0xf000) === 0xf000) return null
  if (high === 0) return (value & 0xffff).toString(16).padStart(8, '0')
  return high.toString(16).padStart(8, '0')
}

function hklToLangId(hkl) {
  const value = Number(hkl) >>> 0
  return (value & 0xffff).toString(16).padStart(4, '0')
}

function stripBidiMarks(text) {
  if (typeof text !== 'string') return ''
  return Array.from(text).filter((character) => !BIDI_MARK_CODES.includes(character.codePointAt(0))).join('')
}

function parseSwitchHotkey(values) {
  const source = values && typeof values === 'object' ? values : {}
  const combined = SWITCH_HOTKEYS[String(source.hotkey ?? '').trim()] ?? 'default'
  const pick = (value) => SWITCH_HOTKEYS[String(value ?? '').trim()] ?? combined
  return { language: pick(source.languageHotkey), layout: pick(source.layoutHotkey) }
}

function sanitizeLanguageTags(tags, knownTags) {
  if (!Array.isArray(tags)) return []
  const allowed = knownTags ? new Set(Array.from(knownTags, (tag) => String(tag).toLowerCase())) : null
  const seen = new Set()
  const result = []
  for (const tag of tags) {
    if (!isValidLanguageTag(tag)) continue
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    if (allowed && !allowed.has(key)) continue
    seen.add(key)
    result.push(tag)
    if (result.length >= MAX_ENTRIES) break
  }
  return result
}

function sanitizeInputMethodTips(tips) {
  if (!Array.isArray(tips)) return []
  const seen = new Set()
  const result = []
  for (const tip of tips) {
    if (!isValidInputMethodTip(tip)) continue
    const key = tip.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(tip)
    if (result.length >= MAX_ENTRIES) break
  }
  return result
}

function resolveCatalogName(entry, resolveIndirectString) {
  const source = entry && typeof entry === 'object' ? entry : {}
  const fallback = typeof source.text === 'string' ? source.text : ''
  const indirect = typeof source.display === 'string' ? source.display : ''
  if (indirect && typeof resolveIndirectString === 'function') {
    const resolved = resolveIndirectString(indirect, fallback)
    if (typeof resolved === 'string' && resolved) return resolved
  }
  return fallback
}

function parseInputMethod(tip, catalogs, resolveIndirectString) {
  const parts = splitInputMethodTip(tip)
  if (!parts) return null
  const source = catalogs && typeof catalogs === 'object' ? catalogs : {}
  if (parts.kind === 'ime') {
    const entry = (source.imeCatalog || {})[tip]
    return { tip, kind: 'ime', klid: null, langId: parts.langId, name: resolveCatalogName(entry, resolveIndirectString) || tip }
  }
  const entry = (source.keyboardCatalog || {})[parts.klid]
  return { tip, kind: 'layout', klid: parts.klid, langId: parts.langId, name: resolveCatalogName(entry, resolveIndirectString) || parts.klid }
}

function emptyLanguageState(availability) {
  return {
    availability,
    languages: [],
    displayLanguageOverride: null,
    effectiveDisplayLanguage: '',
    installedDisplayLanguages: [],
    defaultInputMethod: null,
    regionalFormat: { tag: '', englishName: '', nativeName: '' },
    systemLocale: { tag: '', englishName: '' },
    homeLocation: { geoId: 0, name: '' },
    switchHotkey: { language: 'default', layout: 'default' },
    pendingSignOut: false,
  }
}

function parseLanguageState(raw, resolveIndirectString) {
  let data = null
  try {
    data = JSON.parse(raw)
  } catch {
    return emptyLanguageState('error')
  }
  if (!data || typeof data !== 'object') return emptyLanguageState('error')
  if (data.availability !== 'ready') return emptyLanguageState(data.availability === 'module-missing' ? 'module-missing' : 'error')

  const state = emptyLanguageState('ready')
  const rawLanguages = Array.isArray(data.languages) ? data.languages : []
  state.languages = rawLanguages
    .filter((entry) => entry && isValidLanguageTag(entry.tag))
    .map((entry) => ({
      tag: entry.tag,
      langId: LANG_ID.test(String(entry.langId ?? '')) ? String(entry.langId).toLowerCase() : '',
      autonym: typeof entry.autonym === 'string' && entry.autonym ? entry.autonym : entry.tag,
      englishName: typeof entry.englishName === 'string' ? entry.englishName : '',
      localizedName: typeof entry.localizedName === 'string' ? entry.localizedName : '',
      script: typeof entry.script === 'string' ? entry.script : '',
      inputMethods: (Array.isArray(entry.inputMethodTips) ? entry.inputMethodTips : [])
        .map((tip) => parseInputMethod(tip, data, resolveIndirectString))
        .filter(Boolean),
    }))

  state.displayLanguageOverride = isValidLanguageTag(data.displayLanguageOverride) ? data.displayLanguageOverride : null
  state.effectiveDisplayLanguage = isValidLanguageTag(data.effectiveDisplayLanguage) ? data.effectiveDisplayLanguage : ''
  state.installedDisplayLanguages = (Array.isArray(data.installedDisplayLanguages) ? data.installedDisplayLanguages : []).filter(isValidLanguageTag)
  state.defaultInputMethod = isValidInputMethodTip(data.defaultInputMethod) ? data.defaultInputMethod : null
  state.switchHotkey = parseSwitchHotkey(data.switchHotkey)

  const regionalFormat = data.regionalFormat && typeof data.regionalFormat === 'object' ? data.regionalFormat : {}
  state.regionalFormat = {
    tag: isValidLanguageTag(regionalFormat.tag) ? regionalFormat.tag : '',
    englishName: typeof regionalFormat.englishName === 'string' ? regionalFormat.englishName : '',
    nativeName: typeof regionalFormat.nativeName === 'string' ? regionalFormat.nativeName : '',
  }

  const systemLocale = data.systemLocale && typeof data.systemLocale === 'object' ? data.systemLocale : {}
  state.systemLocale = {
    tag: isValidLanguageTag(systemLocale.tag) ? systemLocale.tag : '',
    englishName: typeof systemLocale.englishName === 'string' ? systemLocale.englishName : '',
  }

  const homeLocation = data.homeLocation && typeof data.homeLocation === 'object' ? data.homeLocation : {}
  state.homeLocation = {
    geoId: Number.isInteger(homeLocation.geoId) ? homeLocation.geoId : 0,
    name: typeof homeLocation.name === 'string' ? homeLocation.name : '',
  }

  return state
}

function parseCatalog(raw, resolveIndirectString) {
  const empty = { languages: [], layouts: [], regions: [] }
  let data = null
  try {
    data = JSON.parse(raw)
  } catch {
    return empty
  }
  if (!data || typeof data !== 'object') return empty

  const languages = (Array.isArray(data.languages) ? data.languages : [])
    .filter((entry) => entry && isValidLanguageTag(entry.tag))
    .map((entry) => ({
      tag: entry.tag,
      autonym: typeof entry.autonym === 'string' && entry.autonym ? entry.autonym : entry.tag,
      englishName: typeof entry.englishName === 'string' ? entry.englishName : '',
      localizedName: typeof entry.localizedName === 'string' ? entry.localizedName : '',
      defaultTips: sanitizeInputMethodTips(entry.defaultTips),
    }))

  const layouts = (Array.isArray(data.layouts) ? data.layouts : [])
    .filter((entry) => entry && isValidKlid(entry.klid))
    .map((entry) => ({ klid: entry.klid.toLowerCase(), name: resolveCatalogName(entry, resolveIndirectString) || entry.klid }))
    .filter((entry) => entry.name)

  const regions = (Array.isArray(data.regions) ? data.regions : [])
    .filter((entry) => entry && Number.isInteger(entry.geoId) && entry.geoId > 0)
    .map((entry) => ({
      geoId: entry.geoId,
      iso: typeof entry.iso === 'string' ? entry.iso : '',
      englishName: typeof entry.englishName === 'string' ? entry.englishName : '',
      displayName: typeof entry.displayName === 'string' && entry.displayName ? entry.displayName : String(entry.englishName ?? ''),
    }))

  return { languages, layouts, regions }
}

function parseWriteResult(raw) {
  let data = null
  try {
    data = JSON.parse(raw)
  } catch {
    return { ok: false, reason: 'no-output' }
  }
  if (!data || typeof data !== 'object') return { ok: false, reason: 'no-output' }
  if (data.ok === true) return { ok: true, reason: null }
  return { ok: false, reason: typeof data.reason === 'string' && data.reason ? data.reason : 'write-failed' }
}

function findInputMethodForLayout(state, hkl) {
  if (!state || !Array.isArray(state.languages)) return null
  const langId = hklToLangId(hkl)
  const klid = hklToKlid(hkl)
  const methods = state.languages.flatMap((language) => language.inputMethods)
  const exact = methods.find((method) => method.langId === langId && method.klid && method.klid === klid)
  if (exact) return exact
  return methods.find((method) => method.langId === langId) ?? null
}

module.exports = {
  isValidLanguageTag,
  isValidKlid,
  isValidInputMethodTip,
  normalizeKlid,
  splitInputMethodTip,
  klidToLayoutWord,
  hklToKlid,
  hklToLangId,
  stripBidiMarks,
  parseSwitchHotkey,
  sanitizeLanguageTags,
  sanitizeInputMethodTips,
  parseInputMethod,
  parseLanguageState,
  parseCatalog,
  parseWriteResult,
  findInputMethodForLayout,
  emptyLanguageState,
}

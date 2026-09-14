const LOCALE_ID = /^[0-9a-fA-F]{4}$/
const LAYOUT_ID = /^[0-9a-fA-F]{8}$/
const IME_PROFILE_ID = /^(\{[0-9a-fA-F-]{36}\}){2}$/
const LANGUAGE_TAG = /^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8}){0,4}$/
const TIP_SEPARATOR = /[,;]/

function normalizeLayoutId(value) {
  const text = String(value ?? '').trim()
  return LAYOUT_ID.test(text) ? text.toLowerCase() : text
}

function parseInputMethodTip(value) {
  const text = String(value ?? '').trim()
  const separator = text.indexOf(':')
  if (separator === -1) return null
  const localeId = text.slice(0, separator).trim()
  const layoutId = text.slice(separator + 1).trim()
  if (!LOCALE_ID.test(localeId)) return null
  if (!LAYOUT_ID.test(layoutId) && !IME_PROFILE_ID.test(layoutId)) return null
  return { localeId: localeId.toLowerCase(), layoutId: normalizeLayoutId(layoutId) }
}

function formatInputMethodTip(localeId, layoutId) {
  const parsed = parseInputMethodTip(`${localeId}:${layoutId}`)
  return parsed ? `${parsed.localeId}:${parsed.layoutId}` : null
}

function parseInputMethodTips(value) {
  return String(value ?? '')
    .split(TIP_SEPARATOR)
    .map((entry) => parseInputMethodTip(entry))
    .filter(Boolean)
    .map((tip) => `${tip.localeId}:${tip.layoutId}`)
}

function isSafeLanguageTag(value) {
  return LANGUAGE_TAG.test(String(value ?? '').trim())
}

function isSafeInputMethodTip(value) {
  return parseInputMethodTip(value) !== null
}

function isKeyboardLayoutId(value) {
  return LAYOUT_ID.test(String(value ?? '').trim())
}

function parseLayoutCatalogue(raw) {
  const layouts = []
  const seen = new Set()
  for (const line of String(raw ?? '').split(/\r?\n/)) {
    const [rawId, ...rest] = line.split('\t')
    const id = normalizeLayoutId(rawId)
    const name = rest.join('\t').trim()
    if (!isKeyboardLayoutId(id) || !name || seen.has(id)) continue
    seen.add(id)
    layouts.push({ id, name })
  }
  return layouts.sort((a, b) => a.name.localeCompare(b.name))
}

function parseLanguageList(raw) {
  const languages = []
  for (const line of String(raw ?? '').split(/\r?\n/)) {
    const [tag, autonym, name, localeId, tips] = line.split('\t')
    if (!isSafeLanguageTag(tag)) continue
    languages.push({
      tag: tag.trim(),
      autonym: (autonym ?? '').trim() || tag.trim(),
      name: (name ?? '').trim() || tag.trim(),
      localeId: LOCALE_ID.test(String(localeId ?? '').trim()) ? localeId.trim().toLowerCase() : null,
      layouts: parseInputMethodTips(tips),
    })
  }
  return languages
}

function describeInputMethodTip(tip, layoutNameById) {
  const parsed = parseInputMethodTip(tip)
  if (!parsed) return null
  return {
    tip,
    localeId: parsed.localeId,
    layoutId: parsed.layoutId,
    name: layoutNameById.get(parsed.layoutId) ?? parsed.layoutId,
  }
}

function withLayoutNames(languages, catalogue) {
  const layoutNameById = new Map(catalogue.map((layout) => [layout.id, layout.name]))
  return languages.map((language) => ({
    ...language,
    layouts: language.layouts.map((tip) => describeInputMethodTip(tip, layoutNameById)).filter(Boolean),
  }))
}

function addInputMethodTip(tips, tip) {
  if (!isSafeInputMethodTip(tip) || tips.includes(tip)) return tips
  return [...tips, tip]
}

function removeInputMethodTip(tips, tip) {
  return tips.filter((entry) => entry !== tip)
}

function reorderInputMethodTips(tips, order) {
  const requested = order.filter((tip) => tips.includes(tip))
  const untouched = tips.filter((tip) => !requested.includes(tip))
  return [...new Set([...requested, ...untouched])]
}

function buildInputMethodTipList(tips) {
  const safe = tips.filter(isSafeInputMethodTip)
  return safe.length ? `@(${safe.map((tip) => `'${tip}'`).join(',')})` : '@()'
}

function composeKeyboardLayoutHandle(tip) {
  const parsed = parseInputMethodTip(tip)
  if (!parsed || !isKeyboardLayoutId(parsed.layoutId)) return 0
  const localeId = parseInt(parsed.localeId, 16)
  const layoutId = parseInt(parsed.layoutId, 16)
  return (((layoutId & 0xffff) << 16) | localeId) >>> 0
}

function parseLanguageCatalogue(raw) {
  const languages = []
  const seen = new Set()
  for (const line of String(raw ?? '').split(/\r?\n/)) {
    const [rawTag, nativeName, englishName] = line.split('\t')
    const tag = String(rawTag ?? '').trim()
    if (!isSafeLanguageTag(tag) || seen.has(tag.toLowerCase())) continue
    seen.add(tag.toLowerCase())
    const name = (englishName ?? '').trim() || tag
    languages.push({ tag, name, nativeName: (nativeName ?? '').trim() || name })
  }
  return languages.sort((a, b) => a.name.localeCompare(b.name))
}

function hasLanguageTag(languages, tag) {
  const wanted = String(tag ?? '').trim().toLowerCase()
  return languages.some((language) => language.tag.toLowerCase() === wanted)
}

function buildAddLanguageCommand(tag) {
  if (!isSafeLanguageTag(tag)) return null
  return `$list = Get-WinUserLanguageList; $list.Add('${tag.trim()}'); Set-WinUserLanguageList -LanguageList $list -Force -WarningAction SilentlyContinue`
}

function buildRemoveLanguageCommand(tag) {
  if (!isSafeLanguageTag(tag)) return null
  return `$list = Get-WinUserLanguageList; $target = $null; foreach ($language in $list) { if ($language.LanguageTag -eq '${tag.trim()}') { $target = $language } }; if ($target -and $list.Count -gt 1) { [void]$list.Remove($target); Set-WinUserLanguageList -LanguageList $list -Force -WarningAction SilentlyContinue }`
}

module.exports = {
  parseLanguageCatalogue,
  hasLanguageTag,
  buildAddLanguageCommand,
  buildRemoveLanguageCommand,
  parseInputMethodTip,
  formatInputMethodTip,
  parseInputMethodTips,
  isSafeLanguageTag,
  isSafeInputMethodTip,
  isKeyboardLayoutId,
  parseLayoutCatalogue,
  parseLanguageList,
  withLayoutNames,
  addInputMethodTip,
  removeInputMethodTip,
  reorderInputMethodTips,
  buildInputMethodTipList,
  composeKeyboardLayoutHandle,
}

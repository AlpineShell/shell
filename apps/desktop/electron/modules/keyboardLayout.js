const { runPowerShell } = require('../powershell')
const {
  REG_NOTIFY_CHANGE_NAME,
  REG_NOTIFY_CHANGE_LAST_SET,
  watchCurrentUserKeyChanges,
} = require('../registryWatch')
const {
  parseInputMethodTip,
  formatInputMethodTip,
  isSafeLanguageTag,
  isKeyboardLayoutId,
  parseLayoutCatalogue,
  parseLanguageList,
  parseLanguageCatalogue,
  hasLanguageTag,
  buildAddLanguageCommand,
  buildRemoveLanguageCommand,
  withLayoutNames,
  addInputMethodTip,
  removeInputMethodTip,
  reorderInputMethodTips,
  buildInputMethodTipList,
  composeKeyboardLayoutHandle,
} = require('./keyboardLayoutParser')

const PRELOAD_KEY = 'Keyboard Layout\\Preload'
const USER_PROFILE_KEY = 'Control Panel\\International\\User Profile'
const CHANGE_CHECK_INTERVAL_MS = 1000
const CHANGE_SETTLE_MS = 400

const LAYOUT_CATALOGUE_COMMAND =
  "Get-ChildItem 'HKLM:/SYSTEM/CurrentControlSet/Control/Keyboard Layouts' | ForEach-Object { $_.PSChildName + [char]9 + $_.GetValue('Layout Text') }"
const LANGUAGE_CATALOGUE_COMMAND =
  '[System.Globalization.CultureInfo]::GetCultures([System.Globalization.CultureTypes]::SpecificCultures) | ForEach-Object { $_.Name + [char]9 + $_.NativeName + [char]9 + $_.EnglishName }'
const LANGUAGE_LIST_COMMAND =
  "$list = Get-WinUserLanguageList; foreach ($language in $list) { $lcid = 0; try { $lcid = [System.Globalization.CultureInfo]::GetCultureInfo($language.LanguageTag).LCID } catch { }; $language.LanguageTag + [char]9 + $language.Autonym + [char]9 + $language.EnglishName + [char]9 + ('{0:x4}' -f $lcid) + [char]9 + ($language.InputMethodTips -join ',') }"
const DEFAULT_INPUT_METHOD_COMMAND = '(Get-WinDefaultInputMethodOverride).InputMethodTip'

const WM_INPUTLANGCHANGEREQUEST = 0x0050
const KLF_NOTELLSHELL = 0x0080

let broadcast = null
let currentState = { languages: [], defaultInputMethod: null }
let lastPublishedState = null
let cachedCatalogue = null
let cachedLanguageCatalogue = null
let refreshTimer = null
let windowApi = null
let windowApiUnavailable = false

function loadWindowApi() {
  if (windowApi || windowApiUnavailable) return windowApi
  try {
    const koffi = require('koffi')
    const user32 = koffi.load('user32.dll')
    windowApi = {
      GetForegroundWindow: user32.func('__stdcall', 'GetForegroundWindow', 'uintptr_t', []),
      PostMessageW: user32.func('__stdcall', 'PostMessageW', 'int', ['uintptr_t', 'uint32', 'uintptr_t', 'intptr_t']),
      LoadKeyboardLayoutW: user32.func('__stdcall', 'LoadKeyboardLayoutW', 'uintptr_t', ['str16', 'uint32']),
      GetKeyboardLayoutList: user32.func('__stdcall', 'GetKeyboardLayoutList', 'int', ['int', koffi.out(koffi.pointer('uintptr_t'))]),
    }
  } catch (e) {
    windowApiUnavailable = true
    console.error('[keyboardLayout] user32 unavailable:', e.message)
  }
  return windowApi
}

function toNumber(value) {
  return typeof value === 'bigint' ? Number(value) : value
}

function setInputMethodTipsCommand(tag, tips) {
  return `$list = Get-WinUserLanguageList; foreach ($language in $list) { if ($language.LanguageTag -eq '${tag}') { $language.InputMethodTips.Clear(); foreach ($tip in ${buildInputMethodTipList(tips)}) { [void]$language.InputMethodTips.Add($tip) } } }; Set-WinUserLanguageList -LanguageList $list -Force -WarningAction SilentlyContinue`
}

function setDefaultInputMethodCommand(tip) {
  const target = tip ? ` -InputTip '${tip}'` : ''
  return `Set-WinDefaultInputMethodOverride${target} -WarningAction SilentlyContinue`
}

async function readLayoutCatalogue() {
  if (cachedCatalogue) return cachedCatalogue
  const catalogue = parseLayoutCatalogue(await runPowerShell(LAYOUT_CATALOGUE_COMMAND))
  if (catalogue.length) cachedCatalogue = catalogue
  return catalogue
}

async function readLanguageCatalogue() {
  if (cachedLanguageCatalogue) return cachedLanguageCatalogue
  const catalogue = parseLanguageCatalogue(await runPowerShell(LANGUAGE_CATALOGUE_COMMAND))
  if (catalogue.length) cachedLanguageCatalogue = catalogue
  return catalogue
}

async function readLanguages() {
  const raw = await runPowerShell(LANGUAGE_LIST_COMMAND)
  if (!raw) return null
  return withLayoutNames(parseLanguageList(raw), await readLayoutCatalogue())
}

async function readDefaultInputMethod() {
  const tip = parseInputMethodTip(await runPowerShell(DEFAULT_INPUT_METHOD_COMMAND))
  return tip ? `${tip.localeId}:${tip.layoutId}` : null
}

async function refreshState() {
  const [languages, defaultInputMethod] = await Promise.all([readLanguages(), readDefaultInputMethod()])
  if (languages) currentState = { languages, defaultInputMethod }
  return currentState
}

async function publishState() {
  const state = await refreshState()
  const serialized = JSON.stringify(state)
  if (serialized === lastPublishedState) return state
  lastPublishedState = serialized
  if (broadcast) broadcast('keyboard/changed', state)
  return state
}

function findLanguage(languages, tag) {
  const wanted = String(tag ?? '').toLowerCase()
  return languages.find((language) => language.tag.toLowerCase() === wanted) ?? null
}

async function changeInputMethodTips(tag, planNextTips) {
  if (!isSafeLanguageTag(tag)) {
    console.error('[keyboardLayout] refusing an unsafe language tag:', tag)
    return currentState
  }
  const { languages } = await refreshState()
  const language = findLanguage(languages, tag)
  if (!language) return currentState
  const tips = language.layouts.map((layout) => layout.tip)
  const next = planNextTips(tips, language)
  if (!next || next.join(',') === tips.join(',')) return currentState
  await runPowerShell(setInputMethodTipsCommand(language.tag, next))
  return publishState()
}

function addLayout(tag, layoutId) {
  return changeInputMethodTips(tag, (tips, language) => {
    if (!isKeyboardLayoutId(layoutId)) return null
    const tip = formatInputMethodTip(language.localeId, layoutId)
    return tip ? addInputMethodTip(tips, tip) : null
  })
}

function removeLayout(tag, tip) {
  return changeInputMethodTips(tag, (tips) => removeInputMethodTip(tips, tip))
}

function reorderLayouts(tag, order) {
  return changeInputMethodTips(tag, (tips) => reorderInputMethodTips(tips, Array.isArray(order) ? order : []))
}

function languageChangeSucceeded(state) {
  return { ok: true, error: null, state }
}

function languageChangeFailed(error, state) {
  console.error('[keyboardLayout]', error)
  return { ok: false, error, state }
}

async function addLanguage(tag) {
  const command = buildAddLanguageCommand(tag)
  if (!command) return languageChangeFailed('That is not a language Windows can add.', currentState)
  const { languages } = await refreshState()
  if (languages.length === 0) return languageChangeFailed('Windows has not reported your languages yet.', currentState)
  if (hasLanguageTag(languages, tag)) return languageChangeSucceeded(currentState)
  await runPowerShell(command)
  const state = await publishState()
  const added = hasLanguageTag(state.languages, tag) || state.languages.length > languages.length
  return added ? languageChangeSucceeded(state) : languageChangeFailed(`Windows did not add ${tag}.`, state)
}

async function removeLanguage(tag) {
  const command = buildRemoveLanguageCommand(tag)
  if (!command) return languageChangeFailed('That is not a language in your list.', currentState)
  const { languages } = await refreshState()
  if (languages.length === 0) return languageChangeFailed('Windows has not reported your languages yet.', currentState)
  if (!hasLanguageTag(languages, tag)) return languageChangeSucceeded(currentState)
  if (languages.length < 2) {
    return languageChangeFailed('Windows needs at least one language, so the last one stays.', currentState)
  }
  await runPowerShell(command)
  const state = await publishState()
  const removed = !hasLanguageTag(state.languages, tag)
  return removed ? languageChangeSucceeded(state) : languageChangeFailed(`Windows did not remove ${tag}.`, state)
}

async function setDefaultInputMethod(tip) {
  const parsed = tip ? parseInputMethodTip(tip) : null
  if (tip && !parsed) {
    console.error('[keyboardLayout] refusing an unrecognised input method tip:', tip)
    return currentState
  }
  await runPowerShell(setDefaultInputMethodCommand(parsed && `${parsed.localeId}:${parsed.layoutId}`))
  return publishState()
}

function loadedLayoutHandles(api) {
  const count = api.GetKeyboardLayoutList(0, null)
  if (!count || count < 1) return []
  const handles = new Array(count).fill(0)
  api.GetKeyboardLayoutList(count, handles)
  return handles.map(toNumber)
}

function resolveLayoutHandle(api, tip) {
  const composed = composeKeyboardLayoutHandle(tip)
  if (composed && loadedLayoutHandles(api).includes(composed)) return composed
  const parsed = parseInputMethodTip(tip)
  if (!parsed || !isKeyboardLayoutId(parsed.layoutId)) return 0
  return toNumber(api.LoadKeyboardLayoutW(parsed.layoutId, KLF_NOTELLSHELL))
}

function activateNow(tip) {
  const api = loadWindowApi()
  if (!api) return { ok: false }
  const handle = resolveLayoutHandle(api, tip)
  const hwnd = toNumber(api.GetForegroundWindow())
  if (!handle || !hwnd) return { ok: false }
  return { ok: api.PostMessageW(hwnd, WM_INPUTLANGCHANGEREQUEST, 0, handle) !== 0 }
}

function scheduleRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => {
    refreshTimer = null
    publishState().catch((e) => console.error('[keyboardLayout] refresh failed:', e?.message ?? e))
  }, CHANGE_SETTLE_MS)
}

function watchForExternalChanges() {
  watchCurrentUserKeyChanges({
    subKey: PRELOAD_KEY,
    label: 'keyboard layout',
    checkIntervalMs: CHANGE_CHECK_INTERVAL_MS,
    onNotify: scheduleRefresh,
  })
  watchCurrentUserKeyChanges({
    subKey: USER_PROFILE_KEY,
    label: 'input language',
    checkIntervalMs: CHANGE_CHECK_INTERVAL_MS,
    changeFilter: REG_NOTIFY_CHANGE_NAME | REG_NOTIFY_CHANGE_LAST_SET,
    watchSubtree: true,
    onNotify: scheduleRefresh,
  })
}

module.exports = {
  handlers: {
    'keyboard/layouts-available': () => readLayoutCatalogue(),
    'keyboard/languages-available': () => readLanguageCatalogue(),
    'keyboard/languages-get': () => refreshState().then((state) => state.languages),
    'keyboard/language-add': (_event, { tag } = {}) => addLanguage(tag),
    'keyboard/language-remove': (_event, { tag } = {}) => removeLanguage(tag),
    'keyboard/layout-add': (_event, { tag, layoutId } = {}) => addLayout(tag, layoutId),
    'keyboard/layout-remove': (_event, { tag, tip } = {}) => removeLayout(tag, tip),
    'keyboard/layouts-reorder': (_event, { tag, tips } = {}) => reorderLayouts(tag, tips),
    'keyboard/default-input-method-get': () => readDefaultInputMethod(),
    'keyboard/default-input-method-set': (_event, tip) => setDefaultInputMethod(tip),
    'keyboard/activate-now': (_event, tip) => activateNow(tip),
  },

  start(publish) {
    broadcast = publish
    refreshState()
      .then((state) => { lastPublishedState = JSON.stringify(state) })
      .catch((e) => console.error('[keyboardLayout] initial read failed:', e?.message ?? e))
    watchForExternalChanges()
  },
}

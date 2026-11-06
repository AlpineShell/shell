const fs = require('fs')
const path = require('path')
const windowEnum = require('./windowEnum')
const { iconHandleToDataUrl } = require('./iconHandle')
const appIcons = require('./appIcons')
const { findWindowRule, appTitleFor, shortcutNameForTitle } = require('../windowRuleMatching')

const START_MENU_ROOTS = [
  path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
  path.join(process.env.PROGRAMDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
]
const SHORTCUT_EXTENSION = '.lnk'
const SHORTCUT_CACHE_MS = 5000
const DWMWA_BORDER_COLOR = 34
const DWMWA_COLOR_NONE = 0xfffffffe
const WM_GETICON = 0x007f
const ICON_BIG = 1
const ICON_SMALL2 = 2
const GCLP_HICON = -14
const SMTO_ABORTIFHUNG = 0x0002
const ICON_QUERY_TIMEOUT_MS = 100
const WINDOW_ICON_SIZE = 32
const BASE_DPI = 96
const MAX_REMEMBERED_WINDOWS = 512

let cachedRules = null
let unsubscribePluginChanges = null
let nativeBindings = null
const ruleByWindow = new Map()
const borderlessWindows = new Set()
const windowIcons = new Map()
const shortcutsByFolder = new Map()

function loadNativeBindings() {
  if (nativeBindings) return nativeBindings
  const koffi = require('koffi')
  const user32 = koffi.load('user32.dll')
  const dwmapi = koffi.load('dwmapi.dll')
  nativeBindings = {
    DwmSetWindowAttribute: dwmapi.func('__stdcall', 'DwmSetWindowAttribute', 'int32', ['uintptr_t', 'uint32', 'void *', 'uint32']),
    SendMessageTimeoutW: user32.func('__stdcall', 'SendMessageTimeoutW', 'intptr_t', ['uintptr_t', 'uint32', 'uintptr_t', 'intptr_t', 'uint32', 'uint32', 'void *']),
    GetClassLongPtrW: user32.func('__stdcall', 'GetClassLongPtrW', 'uintptr_t', ['uintptr_t', 'int']),
    GetDpiForWindow: user32.func('__stdcall', 'GetDpiForWindow', 'uint32', ['uintptr_t']),
  }
  return nativeBindings
}

function pluginsModule() {
  return require('./plugins')
}

function forgetCachedRules() {
  cachedRules = null
  ruleByWindow.clear()
}

function contributedRules() {
  if (cachedRules) return cachedRules
  const plugins = pluginsModule()
  if (!unsubscribePluginChanges) unsubscribePluginChanges = plugins.onPluginsChanged(forgetCachedRules)
  const rules = []
  try {
    for (const record of plugins.listPlugins()) {
      if (record.enabled === false || record.loadable !== true) continue
      for (const rule of (record.contributes && record.contributes.windowRules) || []) rules.push(rule)
    }
  } catch (e) {
    console.error('[windowRules] plugin rule lookup failed:', e && e.message)
  }
  cachedRules = rules
  return rules
}

function windowFacts(hwnd, processId) {
  return {
    className: windowEnum.windowProbe.className(hwnd),
    exePath: processId ? windowEnum.processImagePath(processId) : null,
    title: windowEnum.windowTitle(hwnd),
  }
}

function rememberRule(hwnd, processId, rule) {
  if (ruleByWindow.size >= MAX_REMEMBERED_WINDOWS) {
    ruleByWindow.clear()
    borderlessWindows.clear()
    windowIcons.clear()
  }
  ruleByWindow.set(hwnd, { processId, rule })
}

function ruleForWindow(hwnd) {
  const rules = contributedRules()
  if (rules.length === 0) return null
  const processId = windowEnum.windowProcessId(hwnd)
  const cached = ruleByWindow.get(hwnd)
  if (cached && cached.processId === processId) return cached.rule
  const facts = windowFacts(hwnd, processId)
  const rule = findWindowRule(rules, facts)
  if (rule || facts.title) rememberRule(hwnd, processId, rule)
  return rule
}

function readShortcutNames(folder) {
  const names = new Map()
  for (const root of START_MENU_ROOTS) {
    let entries = []
    try {
      entries = fs.readdirSync(path.join(root, folder))
    } catch {
      continue
    }
    for (const entry of entries) {
      if (path.extname(entry).toLowerCase() !== SHORTCUT_EXTENSION) continue
      const shortcutName = entry.slice(0, -SHORTCUT_EXTENSION.length)
      if (!names.has(shortcutName)) names.set(shortcutName, path.join(root, folder, entry))
    }
  }
  return names
}

function shortcutFolderStamp(folder) {
  return START_MENU_ROOTS.map((root) => {
    try {
      return String(fs.statSync(path.join(root, folder)).mtimeMs)
    } catch {
      return ''
    }
  }).join('|')
}

function shortcutsIn(folder) {
  const cached = shortcutsByFolder.get(folder)
  const now = Date.now()
  if (cached && now - cached.readAt < SHORTCUT_CACHE_MS) return cached.names
  const stamp = shortcutFolderStamp(folder)
  if (cached && cached.stamp === stamp) {
    cached.readAt = now
    return cached.names
  }
  const names = readShortcutNames(folder)
  shortcutsByFolder.set(folder, { names, stamp, readAt: now })
  return names
}

function shortcutForWindow(rule, appTitle) {
  if (!rule.startMenuFolder) return null
  const shortcuts = shortcutsIn(rule.startMenuFolder)
  const titleByShortcut = new Map()
  for (const shortcutName of shortcuts.keys()) titleByShortcut.set(appTitleFor(rule, shortcutName), shortcutName)
  const matchedTitle = shortcutNameForTitle(appTitle, [...titleByShortcut.keys()])
  if (!matchedTitle) return null
  const shortcutName = titleByShortcut.get(matchedTitle)
  return { name: shortcutName, path: shortcuts.get(shortcutName) }
}

function removeBorder(hwnd) {
  if (borderlessWindows.has(hwnd)) return
  const color = Buffer.alloc(4)
  color.writeUInt32LE(DWMWA_COLOR_NONE, 0)
  try {
    if (loadNativeBindings().DwmSetWindowAttribute(hwnd, DWMWA_BORDER_COLOR, color, 4) === 0) borderlessWindows.add(hwnd)
  } catch (e) {
    console.error('[windowRules] border removal failed:', e && e.message)
  }
}

function queryWindowIcon(hwnd, iconType) {
  const result = Buffer.alloc(8)
  const answered = loadNativeBindings().SendMessageTimeoutW(hwnd, WM_GETICON, iconType, 0, SMTO_ABORTIFHUNG, ICON_QUERY_TIMEOUT_MS, result)
  return answered ? result.readBigUInt64LE(0) : 0n
}

function windowIconDataUrl(hwnd) {
  try {
    const hIcon = queryWindowIcon(hwnd, ICON_BIG) || queryWindowIcon(hwnd, ICON_SMALL2) || BigInt(loadNativeBindings().GetClassLongPtrW(hwnd, GCLP_HICON) || 0)
    return iconHandleToDataUrl(hIcon, WINDOW_ICON_SIZE)
  } catch (e) {
    console.error('[windowRules] window icon read failed:', e && e.message)
    return ''
  }
}

async function iconForIdentity(hwnd, identity) {
  if (!windowIcons.get(hwnd)) windowIcons.set(hwnd, windowIconDataUrl(hwnd))
  const windowIcon = windowIcons.get(hwnd)
  if (windowIcon || !identity.shortcutPath) return windowIcon
  return appIcons.iconForFile(identity.shortcutPath)
}

function identifyWindow(hwnd, title) {
  const rule = ruleForWindow(hwnd)
  if (!rule) return null
  if (rule.border === 'none') removeBorder(hwnd)
  const appTitle = appTitleFor(rule, title)
  const shortcut = shortcutForWindow(rule, appTitle)
  return {
    name: shortcut ? shortcut.name : appTitle,
    title: appTitle,
    shortcutPath: shortcut ? shortcut.path : null,
  }
}

function wholeDisplayScale(hwnd) {
  try {
    return Math.max(1, Math.floor(loadNativeBindings().GetDpiForWindow(hwnd) / BASE_DPI))
  } catch {
    return 1
  }
}

function contentInset(hwnd) {
  const rule = ruleForWindow(hwnd)
  if (!rule || !rule.contentInset) return 0
  return rule.contentInset * wholeDisplayScale(hwnd)
}

module.exports = { identifyWindow, iconForIdentity, contentInset }

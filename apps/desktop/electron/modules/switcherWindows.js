const koffi = require('koffi')
const windowEnum = require('./windowEnum')
const windowRules = require('./windowRules')
const appIcons = require('./appIcons')
const shellSurfaces = require('./shellSurfaces')
const exposedOwnWindows = require('./exposedOwnWindows')
const pluginWindows = require('../pluginWindows')
const { friendlyAppName } = require('../appNames')
const { SETTINGS_ICON_DATA_URL } = require('../settingsIcon')
const { isSwitcherWindow } = require('./windowSwitcherPolicy')

const user32 = koffi.load('user32.dll')
const GetShellWindow = user32.func('__stdcall', 'GetShellWindow', 'uintptr_t', [])

const SHELL_PROCESS_NAMES = new Set(['electron', 'alpine-shell', 'alpine shell'])
const SETTINGS_TITLE = 'Settings'

const exeIconCache = new Map()
const pluginIconCache = new Map()
let exposedOwnWindowsProvider = null

function setExposedOwnWindows(provider) {
  exposedOwnWindowsProvider = typeof provider === 'function' ? provider : null
}

function shellWindowHandle() {
  const raw = GetShellWindow()
  return typeof raw === 'bigint' ? Number(raw) : raw
}

function isDesktopShellWindow(hwnd, shellWindow) {
  return shellWindow !== 0 && shellWindow === hwnd
}

const switcherWindowProbe = {
  ...windowEnum.windowProbe,
  isShellSurface: (hwnd) => shellSurfaces.isShellSurface(hwnd),
  isShellWindow: (hwnd) => isDesktopShellWindow(hwnd, shellWindowHandle()),
  isOwnProcess: (hwnd) => windowEnum.windowProcessId(hwnd) === process.pid,
  isExposedOwnWindow: (hwnd) => exposedOwnWindows.isExposedOwnWindow(hwnd, exposedOwnWindowsProvider),
}

function probeWithKnownShellWindow(shellWindow) {
  return { ...switcherWindowProbe, isShellWindow: (hwnd) => isDesktopShellWindow(hwnd, shellWindow) }
}

function isEligible(hwnd) {
  return isSwitcherWindow(hwnd, switcherWindowProbe)
}

function listHandles() {
  const enumerationProbe = probeWithKnownShellWindow(shellWindowHandle())
  return windowEnum.enumerateWindows((hwnd) => isSwitcherWindow(hwnd, enumerationProbe))
}

async function exeIcon(exePath) {
  if (!exePath) return ''
  const key = exePath.toLowerCase()
  if (exeIconCache.has(key)) return exeIconCache.get(key) || ''
  if (/\\WindowsApps\\/i.test(exePath)) {
    const packaged = await appIcons.iconForFile(exePath)
    if (packaged) {
      exeIconCache.set(key, packaged)
      return packaged
    }
  }
  try {
    const { app } = require('electron')
    const dataUrl = (await app.getFileIcon(exePath, { size: 'normal' })).toDataURL()
    exeIconCache.set(key, dataUrl)
    return dataUrl
  } catch {
    exeIconCache.set(key, null)
    return ''
  }
}

function pluginIcon(iconPath) {
  if (pluginIconCache.has(iconPath)) return pluginIconCache.get(iconPath)
  let dataUrl = ''
  try {
    const { nativeImage } = require('electron')
    const image = nativeImage.createFromPath(iconPath)
    if (!image.isEmpty()) dataUrl = image.toDataURL()
  } catch (e) {
    console.error('[switcherWindows] plugin icon read failed:', iconPath, '-', e && e.message)
  }
  pluginIconCache.set(iconPath, dataUrl)
  return dataUrl
}

async function windowIcon(hwnd, exePath, isShellProcess, title) {
  const pluginIconPath = pluginWindows.iconForHandle(hwnd)
  if (pluginIconPath) return pluginIcon(pluginIconPath)
  if (isShellProcess && title === SETTINGS_TITLE) return SETTINGS_ICON_DATA_URL
  return exeIcon(exePath)
}

async function describeWindow(hwnd) {
  const title = windowEnum.windowTitle(hwnd)
  if (!title) return null
  const identity = windowRules.identifyWindow(hwnd, title)
  if (identity) {
    const icon = await windowRules.iconForIdentity(hwnd, identity)
    return { hwnd, title: identity.title, processName: identity.name, icon: icon || '' }
  }
  const exePath = windowEnum.processImagePath(windowEnum.windowProcessId(hwnd))
  const rawProcessName = exePath ? windowEnum.processNameFromPath(exePath) : 'Unknown'
  const isShellProcess = SHELL_PROCESS_NAMES.has(rawProcessName.toLowerCase())
  const processName = isShellProcess ? title : friendlyAppName({ path: exePath, processName: rawProcessName })
  return { hwnd, title, processName, icon: await windowIcon(hwnd, exePath, isShellProcess, title) }
}

async function describeAll() {
  const described = []
  for (const hwnd of listHandles()) {
    const entry = await describeWindow(hwnd)
    if (entry) described.push(entry)
  }
  return described
}

module.exports = { setExposedOwnWindows, isEligible, listHandles, describeAll }

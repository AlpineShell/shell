const { runPowerShell } = require('../powershell')

const PERSONALIZE_KEY = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize'
const LIGHT_THEME_VALUES = ['AppsUseLightTheme', 'SystemUsesLightTheme']
const WINDOWS_DEFAULT_COLOR_MODE = 'light'

const HWND_BROADCAST = 0xffff
const WM_SETTINGCHANGE = 0x001a
const SMTO_ABORTIFHUNG = 0x0002
const SETTING_CHANGE_TIMEOUT_MS = 200
const IMMERSIVE_COLOR_SET = 'ImmersiveColorSet'

let broadcast = null

function toColorMode(value) {
  return value === 'light' || value === 'dark' ? value : null
}

function colorModeFromLightThemeFlag(output) {
  const flag = Number.parseInt(String(output).trim(), 10)
  if (Number.isNaN(flag)) return WINDOWS_DEFAULT_COLOR_MODE
  return flag === 0 ? 'dark' : 'light'
}

function readColorModeCommand() {
  return `(Get-ItemProperty -Path '${PERSONALIZE_KEY}' -Name AppsUseLightTheme -ErrorAction SilentlyContinue).AppsUseLightTheme`
}

function writeColorModeCommand(mode) {
  const flag = mode === 'light' ? 1 : 0
  const createKeyIfMissing = `if (-not (Test-Path '${PERSONALIZE_KEY}')) { New-Item -Path '${PERSONALIZE_KEY}' | Out-Null }`
  const setFlags = LIGHT_THEME_VALUES.map(
    (name) => `Set-ItemProperty -Path '${PERSONALIZE_KEY}' -Name ${name} -Value ${flag} -Type DWord`
  )
  return [createKeyIfMissing, ...setFlags].join('; ')
}

function announceColorSetChange() {
  try {
    const koffi = require('koffi')
    const SendMessageTimeoutW = koffi
      .load('user32.dll')
      .func('__stdcall', 'SendMessageTimeoutW', 'intptr_t', ['uintptr_t', 'uint32', 'uintptr_t', 'str16', 'uint32', 'uint32', 'void *'])
    SendMessageTimeoutW(HWND_BROADCAST, WM_SETTINGCHANGE, 0, IMMERSIVE_COLOR_SET, SMTO_ABORTIFHUNG, SETTING_CHANGE_TIMEOUT_MS, null)
  } catch (e) {
    console.error('[colorMode] setting change broadcast failed:', e.message)
  }
}

async function readColorMode() {
  return colorModeFromLightThemeFlag(await runPowerShell(readColorModeCommand()))
}

async function setColorMode(value) {
  const mode = toColorMode(value)
  if (!mode) return readColorMode()
  await runPowerShell(writeColorModeCommand(mode))
  announceColorSetChange()
  const applied = await readColorMode()
  if (broadcast) broadcast('windows/color-mode-changed', applied)
  return applied
}

module.exports = {
  toColorMode,
  colorModeFromLightThemeFlag,
  writeColorModeCommand,
  handlers: {
    'windows/color-mode-get': () => readColorMode(),
    'windows/color-mode-set': (_event, mode) => setColorMode(mode),
  },
  start(b) {
    broadcast = b
  },
}

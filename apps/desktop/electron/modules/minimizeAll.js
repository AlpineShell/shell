const koffi = require('koffi')
const winFocus = require('./winFocus')
const switcherWindows = require('./switcherWindows')
const { planMinimizeAll, rememberMinimized, planRestore } = require('./minimizeAllPolicy')

const user32 = koffi.load('user32.dll')

const IsWindow = user32.func('__stdcall', 'IsWindow', 'int', ['uintptr_t'])
const IsIconic = user32.func('__stdcall', 'IsIconic', 'int', ['uintptr_t'])
const IsWindowEnabled = user32.func('__stdcall', 'IsWindowEnabled', 'int', ['uintptr_t'])
const GetWindowLongW = user32.func('__stdcall', 'GetWindowLongW', 'int32', ['uintptr_t', 'int'])
const ShowWindowAsync = user32.func('__stdcall', 'ShowWindowAsync', 'int', ['uintptr_t', 'int'])

const GWL_STYLE = -16
const WS_MINIMIZEBOX = 0x00020000
const SW_MINIMIZE = 6
const SW_RESTORE = 9

let rememberedTopFirst = []

function isStillMinimized(hwnd) {
  return IsWindow(hwnd) !== 0 && IsIconic(hwnd) !== 0
}

function describeForMinimize(hwnd) {
  return {
    hwnd,
    minimized: IsIconic(hwnd) !== 0,
    enabled: IsWindowEnabled(hwnd) !== 0,
    hasMinimizeBox: (GetWindowLongW(hwnd, GWL_STYLE) & WS_MINIMIZEBOX) !== 0,
  }
}

function minimizeAll() {
  const { remember, minimizeOrder } = planMinimizeAll(switcherWindows.listHandles().map(describeForMinimize))
  rememberedTopFirst = rememberMinimized(rememberedTopFirst, remember, isStillMinimized)
  for (const hwnd of minimizeOrder) ShowWindowAsync(hwnd, SW_MINIMIZE)
}

function restoreMinimized() {
  const { restoreOrder, activate } = planRestore(rememberedTopFirst, isStillMinimized)
  rememberedTopFirst = []
  for (const hwnd of restoreOrder) ShowWindowAsync(hwnd, SW_RESTORE)
  if (activate) winFocus.activateWindow(activate)
}

module.exports = {
  handlers: {
    'windows/minimize-all': () => minimizeAll(),
    'windows/restore-minimized': () => restoreMinimized(),
  },
  minimizeAll,
  restoreMinimized,
}

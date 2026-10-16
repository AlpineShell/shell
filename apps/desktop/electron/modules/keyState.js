const koffi = require('koffi')
const { VK_LWIN, VK_RWIN, VK_SHIFT, VK_CONTROL, VK_MENU } = require('./virtualKeys')

const user32 = koffi.load('user32.dll')

const GetAsyncKeyState = user32.func('__stdcall', 'GetAsyncKeyState', 'int16', ['int'])
const keybd_event = user32.func('__stdcall', 'keybd_event', 'void', ['uint8', 'uint8', 'uint32', 'uintptr_t'])

const KEY_DOWN_BIT = 0x8000
const KEYEVENTF_KEYUP = 0x0002

function isKeyHeld(vkCode) {
  return (GetAsyncKeyState(vkCode) & KEY_DOWN_BIT) !== 0
}

function isWinHeld() {
  return isKeyHeld(VK_LWIN) || isKeyHeld(VK_RWIN)
}

function isShiftHeld() {
  return isKeyHeld(VK_SHIFT)
}

function isCtrlHeld() {
  return isKeyHeld(VK_CONTROL)
}

function isAltHeld() {
  return isKeyHeld(VK_MENU)
}

function releaseWinKeys() {
  keybd_event(VK_LWIN, 0, KEYEVENTF_KEYUP, 0)
  keybd_event(VK_RWIN, 0, KEYEVENTF_KEYUP, 0)
}

module.exports = { isKeyHeld, isWinHeld, isShiftHeld, isCtrlHeld, isAltHeld, releaseWinKeys }

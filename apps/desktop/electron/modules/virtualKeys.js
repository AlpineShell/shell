const VK_BACK = 0x08
const VK_TAB = 0x09
const VK_RETURN = 0x0D
const VK_SHIFT = 0x10
const VK_CONTROL = 0x11
const VK_MENU = 0x12
const VK_CAPITAL = 0x14
const VK_ESCAPE = 0x1B
const VK_SPACE = 0x20
const VK_LEFT = 0x25
const VK_UP = 0x26
const VK_RIGHT = 0x27
const VK_DOWN = 0x28
const VK_D = 0x44
const VK_E = 0x45
const VK_I = 0x49
const VK_M = 0x4D
const VK_P = 0x50
const VK_S = 0x53
const VK_V = 0x56
const VK_LWIN = 0x5B
const VK_RWIN = 0x5C
const VK_LSHIFT = 0xA0
const VK_LMENU = 0xA4
const VK_RMENU = 0xA5
const VK_F4 = 0x73
const VK_OEM_PERIOD = 0xBE

function isWinKey(vkCode) {
  return vkCode === VK_LWIN || vkCode === VK_RWIN
}

function isAltKey(vkCode) {
  return vkCode === VK_LMENU || vkCode === VK_RMENU
}

module.exports = {
  VK_BACK,
  VK_TAB,
  VK_RETURN,
  VK_SHIFT,
  VK_CONTROL,
  VK_MENU,
  VK_CAPITAL,
  VK_ESCAPE,
  VK_SPACE,
  VK_LEFT,
  VK_UP,
  VK_RIGHT,
  VK_DOWN,
  VK_D,
  VK_E,
  VK_I,
  VK_M,
  VK_P,
  VK_S,
  VK_V,
  VK_LWIN,
  VK_RWIN,
  VK_LSHIFT,
  VK_LMENU,
  VK_RMENU,
  VK_F4,
  VK_OEM_PERIOD,
  isWinKey,
  isAltKey,
}

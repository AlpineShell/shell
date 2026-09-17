const CURSOR_STYLES = [
  'Bibata-Modern-Ice',
  'Bibata-Modern-Classic',
  'Bibata-Modern-Amber',
  'Bibata-Original-Ice',
  'Bibata-Original-Classic',
  'Bibata-Original-Amber',
]

const DEFAULT_CURSOR_STYLE = 'Bibata-Modern-Ice'

const CURSOR_REGISTRY_MAP = {
  'Arrow': 'Pointer.cur',
  'Help': 'Help.cur',
  'AppStarting': 'Work.ani',
  'Wait': 'Busy.ani',
  'Crosshair': 'Cross.cur',
  'IBeam': 'Text.cur',
  'NWPen': 'Handwriting.cur',
  'No': 'Unavailable.cur',
  'SizeNS': 'Vert.cur',
  'SizeWE': 'Horz.cur',
  'SizeNWSE': 'Dgn1.cur',
  'SizeNESW': 'Dgn2.cur',
  'SizeAll': 'Move.cur',
  'UpArrow': 'Alternate.cur',
  'Hand': 'Link.cur',
  'Pin': 'Pin.cur',
  'Person': 'Person.cur',
}

function cursorStyleOrDefault(style) {
  return CURSOR_STYLES.includes(style) ? style : DEFAULT_CURSOR_STYLE
}

module.exports = { CURSOR_STYLES, DEFAULT_CURSOR_STYLE, CURSOR_REGISTRY_MAP, cursorStyleOrDefault }

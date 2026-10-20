const {
  VK_LEFT,
  VK_UP,
  VK_RIGHT,
  VK_DOWN,
  VK_TAB,
  VK_RETURN,
  VK_BACK,
  VK_SPACE,
  VK_DELETE,
  VK_D,
  VK_E,
  VK_I,
  VK_L,
  VK_M,
  VK_P,
  VK_S,
  VK_V,
  VK_ESCAPE,
  VK_F4,
  VK_OEM_PERIOD,
  VK_SHIFT,
  VK_CONTROL,
  VK_MENU,
  VK_LWIN,
  VK_RWIN,
  VK_LSHIFT,
  VK_RSHIFT,
  VK_LCONTROL,
  VK_RCONTROL,
  VK_LMENU,
  VK_RMENU,
} = require('./virtualKeys')

const MODIFIERS = ['win', 'ctrl', 'alt', 'shift']

const MODIFIER_LABELS = { win: 'Win', ctrl: 'Ctrl', alt: 'Alt', shift: 'Shift' }

const ARROW_KEYS = [
  [VK_LEFT, 'left'],
  [VK_UP, 'up'],
  [VK_RIGHT, 'right'],
  [VK_DOWN, 'down'],
]

const SIDE_ARROW_KEYS = [
  [VK_LEFT, 'left'],
  [VK_RIGHT, 'right'],
]

const ARROW_LABELS = new Map([
  [ARROW_KEYS, '← ↑ → ↓'],
  [SIDE_ARROW_KEYS, '← →'],
])

const SHORTCUT_BINDINGS = Object.freeze([
  { id: 'snapWindow', action: 'tile', arrows: ARROW_KEYS, chord: { win: true, ctrl: false, shift: false }, payload: { crossDisplay: false }, inline: true },
  { id: 'moveToOtherDisplay', action: 'tile', arrows: SIDE_ARROW_KEYS, chord: { win: true, ctrl: false, shift: true }, payload: { crossDisplay: true }, inline: true },
  { id: 'switchDesktop', action: 'switchDesktop', arrows: SIDE_ARROW_KEYS, chord: { win: true, ctrl: true, shift: false } },
  { id: 'moveWindowToDesktop', action: 'moveWindowToDesktop', arrows: SIDE_ARROW_KEYS, chord: { win: true, ctrl: true, shift: true } },
  { id: 'addDesktop', action: 'addDesktop', chord: { win: true, ctrl: true, vkCode: VK_D } },
  { id: 'closeDesktop', action: 'closeDesktop', chord: { win: true, ctrl: true, vkCode: VK_F4 } },
  { id: 'openFileExplorer', action: 'openFileExplorer', chord: { win: true, vkCode: VK_E } },
  { id: 'openSettings', action: 'openSettings', chord: { win: true, vkCode: VK_I } },
  { id: 'openEmojiPicker', action: 'openEmojiPicker', chord: { win: true, vkCode: VK_OEM_PERIOD }, releasesWinKey: true },
  { id: 'openClipboardHistory', action: 'openClipboardHistory', chord: { win: true, vkCode: VK_V } },
  { id: 'openDisplayModePicker', action: 'openDisplayModePicker', chord: { win: true, vkCode: VK_P } },
  { id: 'takeScreenshot', action: 'takeScreenshot', chord: { win: true, shift: true, vkCode: VK_S } },
  { id: 'minimizeAll', action: 'minimizeAll', chord: { win: true, shift: false, vkCode: VK_M } },
  { id: 'restoreMinimized', action: 'restoreMinimized', chord: { win: true, shift: true, vkCode: VK_M } },
])

const FIXED_SHORTCUTS = Object.freeze([{ action: 'cancelScreenshot', vkCode: VK_ESCAPE, inline: true }])

const DEFAULT_CHORDS = Object.freeze(Object.fromEntries(SHORTCUT_BINDINGS.map((binding) => [binding.id, binding.chord])))

const RESERVED_CHORDS = [
  { alt: true, vkCode: VK_TAB },
  { alt: true, vkCode: VK_F4 },
  { ctrl: true, alt: true, vkCode: VK_DELETE },
  { win: true, vkCode: VK_L },
  { ctrl: true, vkCode: VK_ESCAPE },
]

const MODIFIER_OF_KEY = new Map([
  [VK_LWIN, 'win'],
  [VK_RWIN, 'win'],
  [VK_CONTROL, 'ctrl'],
  [VK_LCONTROL, 'ctrl'],
  [VK_RCONTROL, 'ctrl'],
  [VK_MENU, 'alt'],
  [VK_LMENU, 'alt'],
  [VK_RMENU, 'alt'],
  [VK_SHIFT, 'shift'],
  [VK_LSHIFT, 'shift'],
  [VK_RSHIFT, 'shift'],
])

const NAMED_KEYS = new Map([
  [VK_LEFT, '←'],
  [VK_UP, '↑'],
  [VK_RIGHT, '→'],
  [VK_DOWN, '↓'],
  [VK_TAB, 'Tab'],
  [VK_RETURN, 'Enter'],
  [VK_BACK, 'Backspace'],
  [VK_SPACE, 'Space'],
  [VK_DELETE, 'Delete'],
  [VK_ESCAPE, 'Esc'],
  [0x2D, 'Insert'],
  [0x24, 'Home'],
  [0x23, 'End'],
  [0x21, 'Page Up'],
  [0x22, 'Page Down'],
  [0x2C, 'Print'],
  [0x13, 'Pause'],
  [0xBA, ';'],
  [0xBB, '='],
  [0xBC, ','],
  [0xBD, '-'],
  [VK_OEM_PERIOD, '.'],
  [0xBF, '/'],
  [0xC0, '`'],
  [0xDB, '['],
  [0xDC, '\\'],
  [0xDD, ']'],
  [0xDE, "'"],
])

const FIRST_LETTER = 0x41
const LAST_LETTER = 0x5a
const FIRST_DIGIT = 0x30
const LAST_DIGIT = 0x39
const FIRST_NUMPAD_DIGIT = 0x60
const LAST_NUMPAD_DIGIT = 0x69
const FIRST_FUNCTION_KEY = 0x70
const LAST_FUNCTION_KEY = 0x87

function keyLabel(vkCode, charOfKey = () => null) {
  if ((vkCode >= FIRST_LETTER && vkCode <= LAST_LETTER) || (vkCode >= FIRST_DIGIT && vkCode <= LAST_DIGIT)) return String.fromCharCode(vkCode)
  if (vkCode >= FIRST_NUMPAD_DIGIT && vkCode <= LAST_NUMPAD_DIGIT) return `Num ${vkCode - FIRST_NUMPAD_DIGIT}`
  if (vkCode >= FIRST_FUNCTION_KEY && vkCode <= LAST_FUNCTION_KEY) return `F${vkCode - FIRST_FUNCTION_KEY + 1}`
  if (vkCode >= 0xba && vkCode <= 0xe2) {
    const typed = charOfKey(vkCode)
    if (typed) return typed.toUpperCase()
  }
  return NAMED_KEYS.get(vkCode) ?? `Key ${vkCode}`
}

function bindingById(id) {
  return SHORTCUT_BINDINGS.find((binding) => binding.id === id) ?? null
}

function modifierFields(chord) {
  const fields = {}
  for (const modifier of MODIFIERS) {
    if (chord[modifier] !== undefined) fields[modifier] = chord[modifier]
  }
  return fields
}

function shortcutsOfBinding(binding, chord) {
  const base = {
    action: binding.action,
    ...modifierFields(chord),
    ...binding.payload,
    ...(binding.inline ? { inline: true } : {}),
    ...(binding.releasesWinKey ? { releasesWinKey: true } : {}),
  }
  if (binding.arrows) return binding.arrows.map(([vkCode, direction]) => ({ ...base, vkCode, direction }))
  return [{ ...base, vkCode: chord.vkCode }]
}

function buildShellShortcuts(chords = DEFAULT_CHORDS) {
  return [
    ...SHORTCUT_BINDINGS.flatMap((binding) => shortcutsOfBinding(binding, chords[binding.id] ?? binding.chord)),
    ...FIXED_SHORTCUTS,
  ]
}

function modifiersOverlap(first, second) {
  return MODIFIERS.every((modifier) => first[modifier] === undefined || second[modifier] === undefined || first[modifier] === second[modifier])
}

function shortcutsOverlap(first, second) {
  return first.vkCode === second.vkCode && modifiersOverlap(first, second)
}

function isReserved(chord) {
  return RESERVED_CHORDS.some(
    (reserved) => reserved.vkCode === chord.vkCode && MODIFIERS.every((modifier) => reserved[modifier] === undefined || reserved[modifier] === chord[modifier])
  )
}

function storedChordFor(binding, recorded) {
  const chord = { win: Boolean(recorded.win), ctrl: Boolean(recorded.ctrl), alt: Boolean(recorded.alt), shift: Boolean(recorded.shift) }
  return binding.arrows ? chord : { ...chord, vkCode: recorded.vkCode }
}

function validateChord(id, recorded, chords = DEFAULT_CHORDS) {
  const binding = bindingById(id)
  if (!binding) return { ok: false, reason: 'unknown' }
  if (binding.arrows && !binding.arrows.some(([vkCode]) => vkCode === recorded.vkCode)) return { ok: false, reason: 'needs-arrow' }
  if (!recorded.win && !recorded.ctrl && !recorded.alt) return { ok: false, reason: 'needs-modifier' }
  if (isReserved(recorded)) return { ok: false, reason: 'reserved' }
  const chord = storedChordFor(binding, recorded)
  const mine = shortcutsOfBinding(binding, chord)
  for (const other of SHORTCUT_BINDINGS) {
    if (other.id === id) continue
    const theirs = shortcutsOfBinding(other, chords[other.id] ?? other.chord)
    if (mine.some((shortcut) => theirs.some((their) => shortcutsOverlap(shortcut, their)))) {
      return { ok: false, reason: 'taken', takenBy: other.id }
    }
  }
  return { ok: true, chord }
}

function isDefaultChord(id, chord) {
  const binding = bindingById(id)
  if (!binding) return false
  const sameModifiers = MODIFIERS.every((modifier) => Boolean(binding.chord[modifier]) === Boolean(chord[modifier]))
  return sameModifiers && (binding.arrows ? true : binding.chord.vkCode === chord.vkCode)
}

function isStoredChord(binding, chord) {
  if (!chord || typeof chord !== 'object') return false
  if (!MODIFIERS.every((modifier) => typeof chord[modifier] === 'boolean')) return false
  if (!chord.win && !chord.ctrl && !chord.alt) return false
  return binding.arrows ? true : Number.isInteger(chord.vkCode) && !MODIFIER_OF_KEY.has(chord.vkCode)
}

function sanitizeOverrides(stored) {
  const overrides = {}
  if (!stored || typeof stored !== 'object') return overrides
  for (const [id, chord] of Object.entries(stored)) {
    const binding = bindingById(id)
    if (binding && isStoredChord(binding, chord) && !isDefaultChord(id, chord)) overrides[id] = storedChordFor(binding, chord)
  }
  return overrides
}

function effectiveChords(overrides) {
  return { ...DEFAULT_CHORDS, ...overrides }
}

function chordKeys(binding, chord, charOfKey) {
  const keys = MODIFIERS.filter((modifier) => chord[modifier]).map((modifier) => MODIFIER_LABELS[modifier])
  keys.push(binding.arrows ? ARROW_LABELS.get(binding.arrows) : keyLabel(chord.vkCode, charOfKey))
  return keys
}

function shortcutListing(overrides, charOfKey) {
  const chords = effectiveChords(overrides)
  return SHORTCUT_BINDINGS.map((binding) => ({
    id: binding.id,
    keys: chordKeys(binding, chords[binding.id], charOfKey),
    custom: Object.hasOwn(overrides, binding.id),
  }))
}

function heldModifiers(held) {
  const names = new Set(held.values())
  return { win: names.has('win'), ctrl: names.has('ctrl'), alt: names.has('alt'), shift: names.has('shift') }
}

function createShortcutRecorder() {
  const held = new Map()
  const swallowed = new Set()
  let active = false

  function start() {
    active = true
    held.clear()
  }

  function stop() {
    active = false
  }

  function handleKey({ vkCode, isKeyDown, isKeyUp }) {
    if (isKeyUp) {
      held.delete(vkCode)
      return { swallow: swallowed.delete(vkCode), outcome: null }
    }
    if (!isKeyDown) return { swallow: false, outcome: null }
    if (swallowed.has(vkCode)) return { swallow: true, outcome: null }
    if (!active) return { swallow: false, outcome: null }
    swallowed.add(vkCode)
    const modifier = MODIFIER_OF_KEY.get(vkCode)
    if (modifier) {
      held.set(vkCode, modifier)
      return { swallow: true, outcome: null }
    }
    const modifiers = heldModifiers(held)
    active = false
    if (vkCode === VK_ESCAPE && !MODIFIERS.some((name) => modifiers[name])) return { swallow: true, outcome: { kind: 'cancelled' } }
    return { swallow: true, outcome: { kind: 'chord', chord: { ...modifiers, vkCode } } }
  }

  return { start, stop, isActive: () => active, handleKey }
}

module.exports = {
  SHORTCUT_BINDINGS,
  DEFAULT_CHORDS,
  buildShellShortcuts,
  validateChord,
  isDefaultChord,
  sanitizeOverrides,
  effectiveChords,
  shortcutListing,
  keyLabel,
  createShortcutRecorder,
}

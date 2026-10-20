import { describe, it, expect } from 'vitest'
import bindings from './shellShortcutBindings.js'
import shellHotkeyPolicy from './shellHotkeyPolicy.js'
import virtualKeys from './virtualKeys.js'

const {
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
} = bindings
const { shortcutForKey } = shellHotkeyPolicy
const { VK_LEFT, VK_RIGHT, VK_UP, VK_E, VK_I, VK_K, VK_L, VK_TAB, VK_F4, VK_ESCAPE, VK_OEM_PERIOD, VK_LWIN, VK_LCONTROL, VK_RMENU, VK_LSHIFT } = {
  ...virtualKeys,
  VK_K: 0x4b,
}

function held({ win = false, ctrl = false, alt = false, shift = false } = {}) {
  return { isWinHeld: () => win, isCtrlHeld: () => ctrl, isAltHeld: () => alt, isShiftHeld: () => shift }
}

function chord(keys) {
  return { win: false, ctrl: false, alt: false, shift: false, ...keys }
}

function keyDown(vkCode) {
  return { vkCode, isKeyDown: true, isKeyUp: false }
}

function keyUp(vkCode) {
  return { vkCode, isKeyDown: false, isKeyUp: true }
}

describe('buildShellShortcuts', () => {
  it('builds the shortcuts the shell always had from the default bindings', () => {
    const shortcuts = buildShellShortcuts()
    expect(shortcutForKey(VK_E, held({ win: true }), shortcuts).action).toBe('openFileExplorer')
    expect(shortcutForKey(VK_I, held({ win: true }), shortcuts).action).toBe('openSettings')
    expect(shortcutForKey(VK_ESCAPE, held(), shortcuts).action).toBe('cancelScreenshot')
  })

  it('moves a shortcut to the keys it was set to, and frees the old ones', () => {
    const shortcuts = buildShellShortcuts(effectiveChords({ openSettings: chord({ ctrl: true, alt: true, vkCode: VK_K }) }))
    expect(shortcutForKey(VK_K, held({ ctrl: true, alt: true }), shortcuts).action).toBe('openSettings')
    expect(shortcutForKey(VK_I, held({ win: true }), shortcuts)).toBe(null)
  })

  it('needs exactly the modifiers a set shortcut was given', () => {
    const shortcuts = buildShellShortcuts(effectiveChords({ openSettings: chord({ ctrl: true, alt: true, vkCode: VK_K }) }))
    expect(shortcutForKey(VK_K, held({ ctrl: true, alt: true, shift: true }), shortcuts)).toBe(null)
  })

  it('keeps the arrows of a family and moves only its modifiers', () => {
    const shortcuts = buildShellShortcuts(effectiveChords({ switchDesktop: chord({ ctrl: true, alt: true }) }))
    expect(shortcutForKey(VK_LEFT, held({ ctrl: true, alt: true }), shortcuts)).toMatchObject({ action: 'switchDesktop', direction: 'left' })
    expect(shortcutForKey(VK_RIGHT, held({ win: true, ctrl: true }), shortcuts)).toBe(null)
  })

  it('keeps a moved Move to the other display moving windows between displays', () => {
    const shortcuts = buildShellShortcuts(effectiveChords({ moveToOtherDisplay: chord({ ctrl: true, alt: true }) }))
    expect(shortcutForKey(VK_RIGHT, held({ ctrl: true, alt: true }), shortcuts)).toMatchObject({ action: 'tile', crossDisplay: true })
  })
})

describe('validateChord', () => {
  it('accepts free keys held with Win, Ctrl or Alt and returns them to store', () => {
    expect(validateChord('openSettings', chord({ ctrl: true, alt: true, vkCode: VK_K }))).toEqual({
      ok: true,
      chord: chord({ ctrl: true, alt: true, vkCode: VK_K }),
    })
  })

  it('refuses a key without Win, Ctrl or Alt, so typing keeps working', () => {
    expect(validateChord('openSettings', chord({ vkCode: VK_K }))).toEqual({ ok: false, reason: 'needs-modifier' })
    expect(validateChord('openSettings', chord({ shift: true, vkCode: VK_K }))).toEqual({ ok: false, reason: 'needs-modifier' })
  })

  it('refuses the keys Windows keeps for itself', () => {
    expect(validateChord('openSettings', chord({ alt: true, vkCode: VK_TAB }))).toMatchObject({ reason: 'reserved' })
    expect(validateChord('openSettings', chord({ alt: true, shift: true, vkCode: VK_TAB }))).toMatchObject({ reason: 'reserved' })
    expect(validateChord('openSettings', chord({ alt: true, vkCode: VK_F4 }))).toMatchObject({ reason: 'reserved' })
    expect(validateChord('openSettings', chord({ win: true, vkCode: VK_L }))).toMatchObject({ reason: 'reserved' })
  })

  it('names the shortcut that already has the keys', () => {
    expect(validateChord('openSettings', chord({ win: true, vkCode: VK_E }))).toEqual({ ok: false, reason: 'taken', takenBy: 'openFileExplorer' })
  })

  it('counts a default that works with Shift held too as taking the Shift version', () => {
    expect(validateChord('openSettings', chord({ win: true, shift: true, vkCode: VK_E }))).toMatchObject({ reason: 'taken', takenBy: 'openFileExplorer' })
  })

  it('checks against the shortcuts as they are set now, not the defaults', () => {
    const chords = effectiveChords({ openFileExplorer: chord({ ctrl: true, alt: true, vkCode: VK_K }) })
    expect(validateChord('openSettings', chord({ win: true, vkCode: VK_E }), chords)).toMatchObject({ ok: true })
    expect(validateChord('openSettings', chord({ ctrl: true, alt: true, vkCode: VK_K }), chords)).toMatchObject({ reason: 'taken' })
  })

  it('asks a family for an arrow and stores only its modifiers', () => {
    expect(validateChord('switchDesktop', chord({ ctrl: true, alt: true, vkCode: VK_K }))).toEqual({ ok: false, reason: 'needs-arrow' })
    expect(validateChord('switchDesktop', chord({ ctrl: true, alt: true, vkCode: VK_LEFT }))).toEqual({ ok: true, chord: chord({ ctrl: true, alt: true }) })
  })

  it('asks a left and right family for a left or right arrow', () => {
    expect(validateChord('switchDesktop', chord({ ctrl: true, alt: true, vkCode: VK_UP }))).toMatchObject({ reason: 'needs-arrow' })
  })

  it('refuses a family that would take arrows another family has', () => {
    expect(validateChord('switchDesktop', chord({ win: true, vkCode: VK_LEFT }))).toEqual({ ok: false, reason: 'taken', takenBy: 'snapWindow' })
  })

  it('knows nothing it was not built with', () => {
    expect(validateChord('formatDrive', chord({ ctrl: true, vkCode: VK_K }))).toEqual({ ok: false, reason: 'unknown' })
  })
})

describe('isDefaultChord', () => {
  it('recognises the keys a shortcut ships with', () => {
    expect(isDefaultChord('openSettings', chord({ win: true, vkCode: VK_I }))).toBe(true)
    expect(isDefaultChord('openSettings', chord({ win: true, vkCode: VK_K }))).toBe(false)
    expect(isDefaultChord('snapWindow', chord({ win: true }))).toBe(true)
  })
})

describe('sanitizeOverrides', () => {
  it('keeps well-formed set shortcuts and drops anything else from the stored file', () => {
    expect(
      sanitizeOverrides({
        openSettings: chord({ ctrl: true, alt: true, vkCode: VK_K }),
        switchDesktop: chord({ ctrl: true, alt: true, vkCode: VK_LEFT }),
        formatDrive: chord({ ctrl: true, vkCode: VK_K }),
        openFileExplorer: chord({ vkCode: VK_E }),
        openEmojiPicker: { win: 'yes', vkCode: VK_OEM_PERIOD },
        minimizeAll: chord({ ctrl: true, vkCode: VK_LSHIFT }),
        addDesktop: chord({ win: true, ctrl: true, vkCode: 0x44 }),
      })
    ).toEqual({
      openSettings: chord({ ctrl: true, alt: true, vkCode: VK_K }),
      switchDesktop: chord({ ctrl: true, alt: true }),
    })
  })

  it('reads nothing from a missing or broken file', () => {
    expect(sanitizeOverrides(undefined)).toEqual({})
    expect(sanitizeOverrides('nope')).toEqual({})
  })
})

describe('shortcutListing', () => {
  it('lists every binding with its keys and whether it was set by hand', () => {
    const listing = shortcutListing({ openSettings: chord({ ctrl: true, alt: true, vkCode: VK_K }) })
    expect(listing).toHaveLength(SHORTCUT_BINDINGS.length)
    expect(listing.find((entry) => entry.id === 'openSettings')).toEqual({ id: 'openSettings', keys: ['Ctrl', 'Alt', 'K'], custom: true })
    expect(listing.find((entry) => entry.id === 'takeScreenshot')).toEqual({ id: 'takeScreenshot', keys: ['Win', 'Shift', 'S'], custom: false })
    expect(listing.find((entry) => entry.id === 'snapWindow')).toEqual({ id: 'snapWindow', keys: ['Win', '← ↑ → ↓'], custom: false })
    expect(listing.find((entry) => entry.id === 'switchDesktop')).toEqual({ id: 'switchDesktop', keys: ['Win', 'Ctrl', '← →'], custom: false })
  })

  it('has a default for every binding', () => {
    expect(Object.keys(DEFAULT_CHORDS).sort()).toEqual(SHORTCUT_BINDINGS.map((binding) => binding.id).sort())
  })
})

describe('keyLabel', () => {
  it('names letters, digits, function keys and the keys with names', () => {
    expect(keyLabel(VK_K)).toBe('K')
    expect(keyLabel(0x37)).toBe('7')
    expect(keyLabel(VK_F4)).toBe('F4')
    expect(keyLabel(VK_ESCAPE)).toBe('Esc')
    expect(keyLabel(VK_OEM_PERIOD)).toBe('.')
  })

  it('names a punctuation key after the character the keyboard layout types', () => {
    expect(keyLabel(0xba, () => 'ü')).toBe('Ü')
  })
})

describe('createShortcutRecorder', () => {
  it('passes every key through until it records', () => {
    const recorder = createShortcutRecorder()
    expect(recorder.handleKey(keyDown(VK_K))).toEqual({ swallow: false, outcome: null })
  })

  it('records the modifiers held with the first other key and swallows the whole chord', () => {
    const recorder = createShortcutRecorder()
    recorder.start()
    expect(recorder.handleKey(keyDown(VK_LCONTROL))).toEqual({ swallow: true, outcome: null })
    expect(recorder.handleKey(keyDown(VK_RMENU))).toEqual({ swallow: true, outcome: null })
    expect(recorder.handleKey(keyDown(VK_K))).toEqual({ swallow: true, outcome: { kind: 'chord', chord: chord({ ctrl: true, alt: true, vkCode: VK_K }) } })
    expect(recorder.isActive()).toBe(false)
    expect(recorder.handleKey(keyUp(VK_K)).swallow).toBe(true)
    expect(recorder.handleKey(keyUp(VK_RMENU)).swallow).toBe(true)
    expect(recorder.handleKey(keyUp(VK_LCONTROL)).swallow).toBe(true)
  })

  it('swallows Win and its release, so recording never opens search', () => {
    const recorder = createShortcutRecorder()
    recorder.start()
    expect(recorder.handleKey(keyDown(VK_LWIN)).swallow).toBe(true)
    expect(recorder.handleKey(keyDown(VK_K)).outcome).toEqual({ kind: 'chord', chord: chord({ win: true, vkCode: VK_K }) })
    expect(recorder.handleKey(keyUp(VK_LWIN)).swallow).toBe(true)
  })

  it('keeps swallowing the auto-repeat of a modifier still held after it recorded, so Windows never sees a lone press', () => {
    const recorder = createShortcutRecorder()
    recorder.start()
    recorder.handleKey(keyDown(VK_LWIN))
    recorder.handleKey(keyDown(VK_K))
    expect(recorder.handleKey(keyDown(VK_LWIN)).swallow).toBe(true)
    expect(recorder.handleKey(keyUp(VK_LWIN)).swallow).toBe(true)
    expect(recorder.handleKey(keyDown(VK_LWIN)).swallow).toBe(false)
  })

  it('lets go of the release of a modifier that was already down when it started', () => {
    const recorder = createShortcutRecorder()
    recorder.start()
    expect(recorder.handleKey(keyUp(VK_LSHIFT)).swallow).toBe(false)
  })

  it('cancels on Escape alone and records Escape with a modifier', () => {
    const recorder = createShortcutRecorder()
    recorder.start()
    expect(recorder.handleKey(keyDown(VK_ESCAPE)).outcome).toEqual({ kind: 'cancelled' })
    expect(recorder.handleKey(keyUp(VK_ESCAPE)).swallow).toBe(true)
    recorder.start()
    recorder.handleKey(keyDown(VK_LCONTROL))
    expect(recorder.handleKey(keyDown(VK_ESCAPE)).outcome).toEqual({ kind: 'chord', chord: chord({ ctrl: true, vkCode: VK_ESCAPE }) })
  })

  it('forgets the modifiers of one recording when the next one starts', () => {
    const recorder = createShortcutRecorder()
    recorder.start()
    recorder.handleKey(keyDown(VK_LCONTROL))
    recorder.stop()
    recorder.start()
    expect(recorder.handleKey(keyDown(VK_K)).outcome).toEqual({ kind: 'chord', chord: chord({ vkCode: VK_K }) })
  })
})

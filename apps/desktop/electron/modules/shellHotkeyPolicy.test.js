import { describe, it, expect } from 'vitest'
import shellHotkeyPolicy from './shellHotkeyPolicy.js'
import virtualKeys from './virtualKeys.js'

const { SHELL_SHORTCUTS, shortcutForKey, createWinTapTracker } = shellHotkeyPolicy
const { VK_LEFT, VK_RIGHT, VK_DOWN, VK_D, VK_E, VK_F4, VK_I, VK_M, VK_P, VK_S, VK_V, VK_ESCAPE, VK_OEM_PERIOD, VK_LWIN, VK_RWIN, VK_SHIFT, VK_TAB } = virtualKeys

function modifiers({ win = false, ctrl = false, shift = false } = {}) {
  return { isWinHeld: () => win, isCtrlHeld: () => ctrl, isShiftHeld: () => shift }
}

const WIN = modifiers({ win: true })
const WIN_SHIFT = modifiers({ win: true, shift: true })
const WIN_CTRL = modifiers({ win: true, ctrl: true })
const WIN_CTRL_SHIFT = modifiers({ win: true, ctrl: true, shift: true })
const NONE = modifiers()

function actionFor(vkCode, held) {
  const shortcut = shortcutForKey(vkCode, held)
  return shortcut && shortcut.action
}

function keyDown(vkCode) {
  return { vkCode, isKeyDown: true, isKeyUp: false }
}

function keyUp(vkCode) {
  return { vkCode, isKeyDown: false, isKeyUp: true }
}

const stillHeld = () => true

describe('shortcutForKey', () => {
  it('minimizes every window on Win+M', () => {
    expect(actionFor(VK_M, WIN)).toBe('minimizeAll')
  })

  it('brings the minimized windows back on Win+Shift+M', () => {
    expect(actionFor(VK_M, WIN_SHIFT)).toBe('restoreMinimized')
  })

  it('opens File Explorer, Settings, emoji and display mode on their Win shortcuts', () => {
    expect(actionFor(VK_E, WIN)).toBe('openFileExplorer')
    expect(actionFor(VK_I, WIN)).toBe('openSettings')
    expect(actionFor(VK_OEM_PERIOD, WIN)).toBe('openEmojiPicker')
    expect(actionFor(VK_P, WIN)).toBe('openDisplayModePicker')
  })

  it('opens clipboard history on Win+V', () => {
    expect(actionFor(VK_V, WIN)).toBe('openClipboardHistory')
    expect(actionFor(VK_V, NONE)).toBe(null)
  })

  it('keeps those shortcuts working with Shift held too', () => {
    expect(actionFor(VK_E, WIN_SHIFT)).toBe('openFileExplorer')
    expect(actionFor(VK_P, WIN_SHIFT)).toBe('openDisplayModePicker')
  })

  it('takes a screenshot only on Win+Shift+S', () => {
    expect(actionFor(VK_S, WIN_SHIFT)).toBe('takeScreenshot')
    expect(actionFor(VK_S, WIN)).toBe(null)
  })

  it('tiles on Win+arrow and moves the window to the next display on Win+Shift+Left and Right', () => {
    expect(shortcutForKey(VK_LEFT, WIN)).toMatchObject({ action: 'tile', direction: 'left', crossDisplay: false, inline: true })
    expect(shortcutForKey(VK_DOWN, WIN)).toMatchObject({ action: 'tile', direction: 'down', crossDisplay: false, inline: true })
    expect(shortcutForKey(VK_LEFT, WIN_SHIFT)).toMatchObject({ action: 'tile', direction: 'left', crossDisplay: true, inline: true })
  })

  it('leaves Win+Shift+Up and Down to Windows, since no display lies above or below', () => {
    expect(shortcutForKey(VK_DOWN, WIN_SHIFT)).toBe(null)
  })

  it('switches desktops on Win+Ctrl+Left and Right instead of tiling', () => {
    expect(shortcutForKey(VK_LEFT, WIN_CTRL)).toMatchObject({ action: 'switchDesktop', direction: 'left' })
    expect(shortcutForKey(VK_RIGHT, WIN_CTRL)).toMatchObject({ action: 'switchDesktop', direction: 'right' })
  })

  it('carries the focused window to the next desktop on Win+Ctrl+Shift+Left and Right', () => {
    expect(shortcutForKey(VK_LEFT, WIN_CTRL_SHIFT)).toMatchObject({ action: 'moveWindowToDesktop', direction: 'left' })
    expect(shortcutForKey(VK_RIGHT, WIN_CTRL_SHIFT)).toMatchObject({ action: 'moveWindowToDesktop', direction: 'right' })
  })

  it('adds a desktop on Win+Ctrl+D and closes the current one on Win+Ctrl+F4', () => {
    expect(actionFor(VK_D, WIN_CTRL)).toBe('addDesktop')
    expect(actionFor(VK_F4, WIN_CTRL)).toBe('closeDesktop')
    expect(actionFor(VK_D, WIN)).toBe(null)
    expect(actionFor(VK_F4, WIN)).toBe(null)
  })

  it('leaves Win+Ctrl+Up and Down alone', () => {
    expect(shortcutForKey(VK_DOWN, WIN_CTRL)).toBe(null)
  })

  it('needs Win held for every Win shortcut', () => {
    for (const vkCode of [VK_M, VK_E, VK_I, VK_OEM_PERIOD, VK_P, VK_LEFT]) {
      expect(shortcutForKey(vkCode, NONE)).toBe(null)
    }
    expect(shortcutForKey(VK_S, modifiers({ shift: true }))).toBe(null)
  })

  it('offers Escape to the screenshot overlay with or without modifiers', () => {
    expect(shortcutForKey(VK_ESCAPE, NONE)).toMatchObject({ action: 'cancelScreenshot', inline: true })
    expect(actionFor(VK_ESCAPE, WIN_SHIFT)).toBe('cancelScreenshot')
  })

  it('releases Win before the emoji picker opens and for no other shortcut', () => {
    const releasing = SHELL_SHORTCUTS.filter((shortcut) => shortcut.releasesWinKey).map((shortcut) => shortcut.action)
    expect(releasing).toEqual(['openEmojiPicker'])
  })

  it('has nothing for an unrelated key and never reads the modifiers for it', () => {
    const reads = []
    const held = { isWinHeld: () => { reads.push('win'); return true }, isShiftHeld: () => { reads.push('shift'); return false } }
    expect(shortcutForKey(VK_TAB, held)).toBe(null)
    expect(reads).toEqual([])
  })

  it('maps each key and modifier combination to at most one shortcut', () => {
    const combos = new Set()
    for (const shortcut of SHELL_SHORTCUTS) {
      for (const win of shortcut.win === undefined ? [false, true] : [shortcut.win]) {
        for (const ctrl of shortcut.ctrl === undefined ? [false, true] : [shortcut.ctrl]) {
          for (const shift of shortcut.shift === undefined ? [false, true] : [shortcut.shift]) {
            const combo = `${shortcut.vkCode}:${win}:${ctrl}:${shift}`
            expect(combos.has(combo)).toBe(false)
            combos.add(combo)
          }
        }
      }
    }
  })
})

describe('createWinTapTracker', () => {
  it('reports a tap when Win goes down and up on its own', () => {
    const tracker = createWinTapTracker()
    expect(tracker.observe(keyDown(VK_LWIN), stillHeld)).toBe(false)
    expect(tracker.observe(keyUp(VK_LWIN), stillHeld)).toBe(true)
  })

  it('works for the right Win key too', () => {
    const tracker = createWinTapTracker()
    tracker.observe(keyDown(VK_RWIN), stillHeld)
    expect(tracker.observe(keyUp(VK_RWIN), stillHeld)).toBe(true)
  })

  it('is not a tap once another key was pressed while Win was down', () => {
    const tracker = createWinTapTracker()
    tracker.observe(keyDown(VK_LWIN), stillHeld)
    tracker.observe(keyDown(VK_E), stillHeld)
    tracker.observe(keyUp(VK_E), stillHeld)
    expect(tracker.observe(keyUp(VK_LWIN), stillHeld)).toBe(false)
  })

  it('counts a modifier pressed with Win as a chord, not a tap', () => {
    const tracker = createWinTapTracker()
    tracker.observe(keyDown(VK_LWIN), stillHeld)
    tracker.observe(keyDown(VK_SHIFT), stillHeld)
    expect(tracker.observe(keyUp(VK_LWIN), stillHeld)).toBe(false)
  })

  it('ignores auto-repeat while Win is held', () => {
    const tracker = createWinTapTracker()
    tracker.observe(keyDown(VK_LWIN), stillHeld)
    tracker.observe(keyDown(VK_LWIN), stillHeld)
    tracker.observe(keyDown(VK_LWIN), stillHeld)
    expect(tracker.observe(keyUp(VK_LWIN), stillHeld)).toBe(true)
  })

  it('does not fire when Windows already saw Win come up, because the hook ran late', () => {
    const tracker = createWinTapTracker()
    tracker.observe(keyDown(VK_LWIN), stillHeld)
    expect(tracker.observe(keyUp(VK_LWIN), () => false)).toBe(false)
  })

  it('only asks whether the key is held for the Win release itself', () => {
    const tracker = createWinTapTracker()
    const asked = []
    const isKeyHeld = (vkCode) => { asked.push(vkCode); return true }
    tracker.observe(keyDown(VK_LWIN), isKeyHeld)
    tracker.observe(keyDown(VK_E), isKeyHeld)
    tracker.observe(keyUp(VK_LWIN), isKeyHeld)
    expect(asked).toEqual([])
  })

  it('starts over after each release', () => {
    const tracker = createWinTapTracker()
    tracker.observe(keyDown(VK_LWIN), stillHeld)
    tracker.observe(keyDown(VK_E), stillHeld)
    tracker.observe(keyUp(VK_LWIN), stillHeld)
    tracker.observe(keyDown(VK_LWIN), stillHeld)
    expect(tracker.observe(keyUp(VK_LWIN), stillHeld)).toBe(true)
  })

  it('reports nothing for a Win release it never saw go down after a reset', () => {
    const tracker = createWinTapTracker()
    tracker.observe(keyDown(VK_LWIN), stillHeld)
    tracker.reset()
    expect(tracker.observe(keyUp(VK_LWIN), stillHeld)).toBe(false)
  })

  it('ignores other keys when Win is not down', () => {
    const tracker = createWinTapTracker()
    expect(tracker.observe(keyDown(VK_E), stillHeld)).toBe(false)
    expect(tracker.observe(keyUp(VK_E), stillHeld)).toBe(false)
  })
})

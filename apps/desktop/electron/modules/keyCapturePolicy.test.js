import { describe, it, expect } from 'vitest'
import keyCapturePolicy from './keyCapturePolicy.js'
import virtualKeys from './virtualKeys.js'

const { emojiKeyMessage, createKeyCapture } = keyCapturePolicy
const { VK_BACK, VK_TAB, VK_RETURN, VK_ESCAPE, VK_LEFT, VK_UP, VK_RIGHT, VK_DOWN, VK_LWIN, VK_RWIN, VK_E, VK_P, VK_SHIFT } = virtualKeys

const VK_A = 0x41

function keyDown(vkCode) {
  return { vkCode, isKeyDown: true, isKeyUp: false }
}

function keyUp(vkCode) {
  return { vkCode, isKeyDown: false, isKeyUp: true }
}

const translateLetters = (vkCode) => (vkCode >= VK_A && vkCode <= 0x5A ? String.fromCharCode(vkCode).toLowerCase() : null)

function claimingCapture(repeatsHeldKeys) {
  const decided = []
  const capture = createKeyCapture({
    repeatsHeldKeys,
    decideKey({ vkCode }) {
      decided.push(vkCode)
      if (vkCode === VK_SHIFT) return { swallow: false, action: null }
      if (vkCode === VK_TAB) return { swallow: false, action: 'dismiss' }
      return { swallow: true, action: `pressed ${vkCode}` }
    },
  })
  return { capture, decided }
}

describe('emojiKeyMessage', () => {
  it('turns the navigation keys into picker commands', () => {
    expect(emojiKeyMessage(VK_ESCAPE, translateLetters)).toEqual({ kind: 'escape' })
    expect(emojiKeyMessage(VK_RETURN, translateLetters)).toEqual({ kind: 'enter' })
    expect(emojiKeyMessage(VK_BACK, translateLetters)).toEqual({ kind: 'backspace' })
    expect(emojiKeyMessage(VK_LEFT, translateLetters)).toEqual({ kind: 'left' })
    expect(emojiKeyMessage(VK_RIGHT, translateLetters)).toEqual({ kind: 'right' })
    expect(emojiKeyMessage(VK_UP, translateLetters)).toEqual({ kind: 'up' })
    expect(emojiKeyMessage(VK_DOWN, translateLetters)).toEqual({ kind: 'down' })
  })

  it('types the character a key produces on the current layout', () => {
    expect(emojiKeyMessage(VK_E, translateLetters)).toEqual({ kind: 'char', value: 'e' })
  })

  it('leaves Tab and the Win keys to the system', () => {
    expect(emojiKeyMessage(VK_TAB, translateLetters)).toBe(null)
    expect(emojiKeyMessage(VK_LWIN, translateLetters)).toBe(null)
    expect(emojiKeyMessage(VK_RWIN, translateLetters)).toBe(null)
  })

  it('never asks the layout to translate those keys', () => {
    const asked = []
    const translate = (vkCode) => { asked.push(vkCode); return 'x' }
    emojiKeyMessage(VK_TAB, translate)
    emojiKeyMessage(VK_LWIN, translate)
    emojiKeyMessage(VK_ESCAPE, translate)
    expect(asked).toEqual([])
  })

  it('has nothing for a key that produces no character', () => {
    expect(emojiKeyMessage(VK_SHIFT, translateLetters)).toBe(null)
  })
})

describe('createKeyCapture', () => {
  it('lets every key through while inactive', () => {
    const { capture, decided } = claimingCapture(false)
    expect(capture.handleKey(keyDown(VK_P))).toEqual({ swallow: false, action: null })
    expect(decided).toEqual([])
  })

  it('swallows a claimed key press and its release while active', () => {
    const { capture } = claimingCapture(false)
    capture.setActive(true)
    expect(capture.handleKey(keyDown(VK_P))).toEqual({ swallow: true, action: `pressed ${VK_P}` })
    expect(capture.handleKey(keyUp(VK_P))).toEqual({ swallow: true, action: null })
  })

  it('lets an unclaimed key through but still reports its action', () => {
    const { capture } = claimingCapture(false)
    capture.setActive(true)
    expect(capture.handleKey(keyDown(VK_TAB))).toEqual({ swallow: false, action: 'dismiss' })
    expect(capture.handleKey(keyUp(VK_TAB))).toEqual({ swallow: false, action: null })
  })

  it('lets through a key the capture ignores', () => {
    const { capture } = claimingCapture(false)
    capture.setActive(true)
    expect(capture.handleKey(keyDown(VK_SHIFT))).toEqual({ swallow: false, action: null })
  })

  it('swallows the release of a key it claimed even after the capture ended', () => {
    const { capture } = claimingCapture(false)
    capture.setActive(true)
    capture.handleKey(keyDown(VK_RETURN))
    capture.setActive(false)
    expect(capture.handleKey(keyUp(VK_RETURN))).toEqual({ swallow: true, action: null })
    expect(capture.handleKey(keyUp(VK_RETURN))).toEqual({ swallow: false, action: null })
  })

  it('forgets stale claimed keys when a new capture starts', () => {
    const { capture } = claimingCapture(false)
    capture.setActive(true)
    capture.handleKey(keyDown(VK_RETURN))
    capture.setActive(true)
    expect(capture.handleKey(keyUp(VK_RETURN))).toEqual({ swallow: false, action: null })
  })

  it('swallows auto-repeat silently when held keys do not repeat', () => {
    const { capture, decided } = claimingCapture(false)
    capture.setActive(true)
    capture.handleKey(keyDown(VK_P))
    expect(capture.handleKey(keyDown(VK_P))).toEqual({ swallow: true, action: null })
    expect(decided).toEqual([VK_P])
  })

  it('repeats the action for a held key when asked to, like Backspace in the emoji search', () => {
    const { capture, decided } = claimingCapture(true)
    capture.setActive(true)
    capture.handleKey(keyDown(VK_BACK))
    expect(capture.handleKey(keyDown(VK_BACK))).toEqual({ swallow: true, action: `pressed ${VK_BACK}` })
    expect(decided).toEqual([VK_BACK, VK_BACK])
  })

  it('reports whether it is active', () => {
    const { capture } = claimingCapture(false)
    expect(capture.isActive()).toBe(false)
    capture.setActive(true)
    expect(capture.isActive()).toBe(true)
    capture.setActive(false)
    expect(capture.isActive()).toBe(false)
  })
})

import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { SHORTCUT_GROUPS, refusalMessage, shortcutLabel } from './shortcutCatalogue'

const require = createRequire(import.meta.url)
const { SHORTCUT_BINDINGS } = require('../../electron/modules/shellShortcutBindings.js') as { SHORTCUT_BINDINGS: { id: string }[] }

const listedBindings = SHORTCUT_GROUPS.flatMap((group) => group.shortcuts.flatMap((shortcut) => (shortcut.binding ? [shortcut.binding] : [])))

describe('the keyboard shortcut list', () => {
  it('lists every shortcut the shell lets you set, once', () => {
    expect([...listedBindings].sort()).toEqual(SHORTCUT_BINDINGS.map((binding) => binding.id).sort())
  })

  it('names every shortcut once', () => {
    const labels = SHORTCUT_GROUPS.flatMap((group) => group.shortcuts.map((shortcut) => shortcut.label))
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('gives every row either a binding to set or fixed keys to show', () => {
    for (const group of SHORTCUT_GROUPS) {
      for (const shortcut of group.shortcuts) expect(Boolean(shortcut.binding) !== Boolean(shortcut.keys)).toBe(true)
    }
  })
})

describe('refusalMessage', () => {
  it('says nothing when the shortcut was saved, cancelled or never pressed', () => {
    expect(refusalMessage({ ok: true })).toBeNull()
    expect(refusalMessage({ ok: false, reason: 'cancelled' })).toBeNull()
    expect(refusalMessage({ ok: false, reason: 'timeout' })).toBeNull()
  })

  it('names the shortcut that already has the keys', () => {
    expect(refusalMessage({ ok: false, reason: 'taken', takenBy: 'openSettings' })).toBe(`Already used by ${shortcutLabel('openSettings')}.`)
  })

  it('explains each other refusal in a sentence', () => {
    expect(refusalMessage({ ok: false, reason: 'needs-modifier' })).toBe('Hold Win, Ctrl or Alt with the key.')
    expect(refusalMessage({ ok: false, reason: 'needs-arrow' })).toBe('Press the modifiers with an arrow key.')
    expect(refusalMessage({ ok: false, reason: 'reserved' })).toBe('Windows keeps that one for itself.')
  })
})

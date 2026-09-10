import { describe, it, expect } from 'vitest'
import launcherHotkey from './launcherHotkey.js'

const { rebind } = launcherHotkey

function recorder(bindable) {
  const attempts = []
  return {
    attempts,
    apply: (hotkey) => {
      attempts.push(hotkey)
      return bindable.includes(hotkey)
    },
  }
}

describe('rebind', () => {
  it('binds the requested hotkey and reports it', () => {
    const { apply, attempts } = recorder(['Alt+Space'])

    expect(rebind('Win', 'Alt+Space', apply)).toEqual({ ok: true, hotkey: 'Alt+Space' })
    expect(attempts).toEqual(['Alt+Space'])
  })

  it('keeps the current hotkey bound when the requested one is taken', () => {
    const { apply, attempts } = recorder(['Win'])

    expect(rebind('Win', 'Ctrl+Space', apply)).toEqual({ ok: false, hotkey: 'Win' })
    expect(attempts).toEqual(['Ctrl+Space', 'Win'])
  })

  it('does not touch a binding that is already the one asked for', () => {
    const { apply, attempts } = recorder(['Alt+Space'])

    expect(rebind('Alt+Space', 'Alt+Space', apply)).toEqual({ ok: true, hotkey: 'Alt+Space' })
    expect(attempts).toEqual([])
  })

  it('reads an empty request as the default hotkey', () => {
    const { apply, attempts } = recorder(['Win'])

    expect(rebind('Alt+Space', '', apply)).toEqual({ ok: true, hotkey: 'Win' })
    expect(attempts).toEqual(['Win'])
  })

  it('reports the hotkey that is bound, never the one that was asked for', () => {
    const { apply } = recorder(['Ctrl+Alt+K'])

    const refused = rebind('Ctrl+Alt+K', 'Ctrl+Shift+P', apply)

    expect(refused.ok).toBe(false)
    expect(refused.hotkey).toBe('Ctrl+Alt+K')
  })

  it('leaves nothing bound only when the previous hotkey is gone too', () => {
    const { apply, attempts } = recorder([])

    expect(rebind('Alt+Space', 'Ctrl+Space', apply)).toEqual({ ok: false, hotkey: 'Alt+Space' })
    expect(attempts).toEqual(['Ctrl+Space', 'Alt+Space'])
  })
})

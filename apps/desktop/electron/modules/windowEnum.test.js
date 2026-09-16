import { describe, it, expect } from 'vitest'
import windowEnum from './windowEnum.js'

const {
  readWideString,
  processNameFromPath,
  taskbarWindowPredicate,
  onScreenWindowPredicate,
  collectEnumeratedWindow,
  WS_EX_TRANSPARENT,
  WS_EX_TOOLWINDOW,
  WS_EX_APPWINDOW,
  WS_EX_NOACTIVATE,
} = windowEnum

const HWND = 0x1234

function probe(overrides) {
  const calls = []
  const base = {
    isVisible: () => true,
    isMinimized: () => false,
    titleLength: () => 12,
    className: () => 'Chrome_WidgetWin_1',
    exStyle: () => 0,
    hasOwner: () => false,
    isCloaked: () => false,
  }
  const merged = { ...base, ...overrides }
  const traced = {}
  for (const name of Object.keys(merged)) {
    traced[name] = (hwnd) => {
      calls.push(name)
      return merged[name](hwnd)
    }
  }
  traced.calls = calls
  return traced
}

function wideBuffer(text, chars) {
  const buffer = Buffer.alloc(chars * 2)
  for (let i = 0; i < text.length && i < chars; i++) buffer.writeUInt16LE(text.charCodeAt(i), i * 2)
  return buffer
}

describe('readWideString', () => {
  it('stops at the terminating NUL', () => {
    expect(readWideString(wideBuffer('Notepad', 16), 16)).toBe('Notepad')
  })

  it('stops at the requested character count when there is no NUL', () => {
    expect(readWideString(wideBuffer('Notepad', 7), 4)).toBe('Note')
  })

  it('returns an empty string for an immediately terminated buffer', () => {
    expect(readWideString(wideBuffer('', 8), 8)).toBe('')
  })

  it('preserves non-ascii characters', () => {
    expect(readWideString(wideBuffer('Größe — ◑', 16), 16)).toBe('Größe — ◑')
  })
})

describe('processNameFromPath', () => {
  it('strips the directory and the exe extension', () => {
    expect(processNameFromPath('D:\\Apps\\Editor\\Code.exe')).toBe('Code')
  })

  it('accepts forward slashes', () => {
    expect(processNameFromPath('/opt/tools/thing.exe')).toBe('thing')
  })

  it('is case insensitive about the extension', () => {
    expect(processNameFromPath('X:\\Bin\\Thing.EXE')).toBe('Thing')
  })

  it('keeps a name that is not an executable', () => {
    expect(processNameFromPath('X:\\Bin\\Alpine Shell')).toBe('Alpine Shell')
  })

  it('returns an empty string for a missing path', () => {
    expect(processNameFromPath(null)).toBe('')
    expect(processNameFromPath('')).toBe('')
  })
})

describe('taskbarWindowPredicate', () => {
  it('accepts a visible, titled, unowned, uncloaked window', () => {
    expect(taskbarWindowPredicate(HWND, probe())).toBe(true)
  })

  it('rejects an invisible window', () => {
    expect(taskbarWindowPredicate(HWND, probe({ isVisible: () => false }))).toBe(false)
  })

  it('rejects an untitled window', () => {
    expect(taskbarWindowPredicate(HWND, probe({ titleLength: () => 0 }))).toBe(false)
  })

  it('rejects a tool window', () => {
    expect(taskbarWindowPredicate(HWND, probe({ exStyle: () => WS_EX_TOOLWINDOW }))).toBe(false)
  })

  it('rejects an owned window', () => {
    expect(taskbarWindowPredicate(HWND, probe({ hasOwner: () => true }))).toBe(false)
  })

  it('accepts an owned window that asks for a taskbar button', () => {
    expect(taskbarWindowPredicate(HWND, probe({ hasOwner: () => true, exStyle: () => WS_EX_APPWINDOW }))).toBe(true)
  })

  it('rejects a cloaked window', () => {
    expect(taskbarWindowPredicate(HWND, probe({ isCloaked: () => true }))).toBe(false)
  })

  it('stops probing after the first rejection', () => {
    const invisible = probe({ isVisible: () => false })
    taskbarWindowPredicate(HWND, invisible)
    expect(invisible.calls).toEqual(['isVisible'])
  })

  it('does not ask for the cloak state of a tool window', () => {
    const toolWindow = probe({ exStyle: () => WS_EX_TOOLWINDOW })
    taskbarWindowPredicate(HWND, toolWindow)
    expect(toolWindow.calls).not.toContain('isCloaked')
  })

  it('passes the window handle through to every probe', () => {
    const seen = []
    taskbarWindowPredicate(HWND, {
      isVisible: (hwnd) => { seen.push(hwnd); return true },
      titleLength: (hwnd) => { seen.push(hwnd); return 4 },
      exStyle: (hwnd) => { seen.push(hwnd); return 0 },
      hasOwner: (hwnd) => { seen.push(hwnd); return false },
      isCloaked: (hwnd) => { seen.push(hwnd); return false },
    })
    expect(seen).toEqual([HWND, HWND, HWND, HWND, HWND])
  })
})

describe('onScreenWindowPredicate', () => {
  it('accepts a visible, restored, uncloaked app window', () => {
    expect(onScreenWindowPredicate(HWND, probe())).toBe(true)
  })

  it('rejects an invisible window', () => {
    expect(onScreenWindowPredicate(HWND, probe({ isVisible: () => false }))).toBe(false)
  })

  it('rejects a minimized window', () => {
    expect(onScreenWindowPredicate(HWND, probe({ isMinimized: () => true }))).toBe(false)
  })

  it.each([
    ['a tool window', WS_EX_TOOLWINDOW],
    ['a window that never takes focus', WS_EX_NOACTIVATE],
    ['a click-through overlay', WS_EX_TRANSPARENT],
  ])('rejects %s', (_label, exStyle) => {
    expect(onScreenWindowPredicate(HWND, probe({ exStyle: () => exStyle }))).toBe(false)
  })

  it.each(['Progman', 'WorkerW'])('rejects the %s desktop window behind the apps', (className) => {
    expect(onScreenWindowPredicate(HWND, probe({ className: () => className }))).toBe(false)
  })

  it('rejects a cloaked window', () => {
    expect(onScreenWindowPredicate(HWND, probe({ isCloaked: () => true }))).toBe(false)
  })

  it('accepts an untitled, owned window that asks for no taskbar button', () => {
    expect(onScreenWindowPredicate(HWND, probe({ titleLength: () => 0, hasOwner: () => true }))).toBe(true)
  })

  it('stops probing after the first rejection', () => {
    const minimized = probe({ isMinimized: () => true })
    onScreenWindowPredicate(HWND, minimized)
    expect(minimized.calls).toEqual(['isVisible', 'isMinimized'])
  })
})

describe('collectEnumeratedWindow', () => {
  function context(predicate) {
    return { predicate, handles: [], failure: null }
  }

  it('keeps a handle the predicate accepts and asks for the next window', () => {
    const ctx = context(() => true)
    expect(collectEnumeratedWindow(ctx, HWND, probe())).toBe(1)
    expect(ctx.handles).toEqual([HWND])
  })

  it('drops a handle the predicate rejects and asks for the next window', () => {
    const ctx = context(() => false)
    expect(collectEnumeratedWindow(ctx, HWND, probe())).toBe(1)
    expect(ctx.handles).toEqual([])
  })

  it('contains a predicate throw instead of letting it escape into native code', () => {
    const boom = new Error('predicate exploded')
    const ctx = context(() => { throw boom })
    expect(() => collectEnumeratedWindow(ctx, HWND, probe())).not.toThrow()
    expect(ctx.failure).toBe(boom)
  })

  it('stops the sweep once a predicate has thrown', () => {
    const ctx = context(() => { throw new Error('predicate exploded') })
    expect(collectEnumeratedWindow(ctx, HWND, probe())).toBe(0)
    ctx.predicate = () => true
    expect(collectEnumeratedWindow(ctx, HWND, probe())).toBe(0)
    expect(ctx.handles).toEqual([])
  })

  it('stops the sweep when no enumeration is in progress', () => {
    expect(collectEnumeratedWindow(null, HWND, probe())).toBe(0)
  })

  it('passes the probe through to the predicate', () => {
    const seen = []
    const shared = probe()
    const ctx = context((hwnd, given) => { seen.push([hwnd, given]); return false })
    collectEnumeratedWindow(ctx, HWND, shared)
    expect(seen).toEqual([[HWND, shared]])
  })
})

describe('module surface', () => {
  it('exposes the sweep and its teardown without loading a native binding at import time', () => {
    expect(typeof windowEnum.enumerateWindows).toBe('function')
    expect(typeof windowEnum.releaseBindings).toBe('function')
    expect(typeof windowEnum.resolveFileDescription).toBe('function')
  })

  it('resolves no description for a missing path without touching the filesystem', async () => {
    await expect(windowEnum.resolveFileDescription('')).resolves.toBeNull()
    await expect(windowEnum.resolveFileDescription(null)).resolves.toBeNull()
  })
})

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { createRequire } from 'module'

const nodeRequire = createRequire(import.meta.url)
const electronPath = nodeRequire.resolve('electron')
let cursorDisplayId = 1

nodeRequire.cache[electronPath] = {
  id: electronPath,
  filename: electronPath,
  loaded: true,
  exports: {
    screen: {
      getCursorScreenPoint: () => ({ x: 0, y: 0 }),
      getDisplayNearestPoint: () => ({ id: cursorDisplayId }),
    },
    BrowserWindow: { getAllWindows: () => [] },
    globalShortcut: { register: () => true, unregister: () => undefined },
  },
}

const { default: notice } = await import('./modules/shellNotice.js')

let sent

beforeEach(() => {
  cursorDisplayId = 1
  sent = []
  notice.start(null, (channel, payload) => sent.push({ channel, payload }))
  notice.handlers['notice/dismiss']()
  sent = []
})

const lastShown = () => sent.filter((e) => e.channel === 'notice/show').at(-1)?.payload

describe('shellNotice confirmations', () => {
  it('carries the confirm labels, defaulting the cancel one', () => {
    notice.show({ id: 'x', message: 'Update Instagram?', confirm: { label: 'Update', run: () => {} } })
    expect(lastShown()).toMatchObject({
      message: 'Update Instagram?',
      confirm: { label: 'Update', cancelLabel: 'Cancel' },
    })
  })

  it('is never a pill, because a pill has no way to answer', () => {
    notice.show({ id: 'x', message: 'ask', pill: true, confirm: { label: 'Go', run: () => {} } })
    expect(lastShown().pill).toBe(false)
  })

  it('runs the confirm once and then hides', () => {
    const run = vi.fn()
    notice.show({ id: 'x', message: 'ask', confirm: { label: 'Go', run } })
    expect(notice.handlers['notice/confirm']()).toEqual({ ok: true })
    expect(run).toHaveBeenCalledTimes(1)
    expect(sent.at(-1).channel).toBe('notice/hide')
    expect(notice.handlers['notice/confirm']()).toEqual({ ok: false })
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('treats a dismissed question as a cancellation', () => {
    const onCancel = vi.fn()
    notice.show({ id: 'x', message: 'ask', confirm: { label: 'Go', run: () => {}, onCancel } })
    notice.handlers['notice/dismiss']()
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('does not cancel when the question was answered', () => {
    const onCancel = vi.fn()
    notice.show({ id: 'x', message: 'ask', confirm: { label: 'Go', run: () => {}, onCancel } })
    notice.handlers['notice/confirm']()
    notice.handlers['notice/dismiss']()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('does not cancel a plain notice that replaces the question', () => {
    const onCancel = vi.fn()
    notice.show({ id: 'x', message: 'ask', confirm: { label: 'Go', run: () => {}, onCancel } })
    notice.handlers['notice/confirm']()
    notice.show({ id: 'x', message: 'Installing…', busy: true, pill: true, timeoutMs: 0 })
    expect(lastShown()).toMatchObject({ pill: true, busy: true, confirm: null })
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('keeps a question on screen regardless of the requested timeout', () => {
    vi.useFakeTimers()
    notice.show({ id: 'x', message: 'ask', timeoutMs: 10, confirm: { label: 'Go', run: () => {} } })
    vi.advanceTimersByTime(5000)
    expect(sent.some((e) => e.channel === 'notice/hide')).toBe(false)
    vi.useRealTimers()
  })

  it('still auto-dismisses a plain notice', () => {
    vi.useFakeTimers()
    notice.show({ id: 'x', message: 'done', timeoutMs: 10 })
    vi.advanceTimersByTime(50)
    expect(sent.at(-1).channel).toBe('notice/hide')
    vi.useRealTimers()
  })
})

describe('shellNotice notices that wait for their turn', () => {
  const shownMessages = () => sent.filter((e) => e.channel === 'notice/show').map((e) => e.payload.message)

  afterEach(() => {
    for (const id of ['first', 'second', 'third']) notice.dismiss(id)
  })

  it('shows straight away when nothing else is on screen', () => {
    notice.show({ id: 'first', message: 'Restart required', waitForTurn: true, timeoutMs: 0 })
    expect(shownMessages()).toEqual(['Restart required'])
  })

  it('waits behind the notice on screen and follows it once that one is dismissed', () => {
    notice.show({ id: 'first', message: 'Reading report.pdf', busy: true, timeoutMs: 0 })
    notice.show({ id: 'second', message: 'Update available', waitForTurn: true, timeoutMs: 0 })
    expect(shownMessages()).toEqual(['Reading report.pdf'])
    notice.handlers['notice/dismiss']()
    expect(shownMessages()).toEqual(['Reading report.pdf', 'Update available'])
    expect(lastShown()).toMatchObject({ id: 'second', message: 'Update available' })
  })

  it('follows a notice that timed out', () => {
    vi.useFakeTimers()
    notice.show({ id: 'first', message: 'Saved', timeoutMs: 10 })
    notice.show({ id: 'second', message: 'Battery low', waitForTurn: true, timeoutMs: 0 })
    vi.advanceTimersByTime(50)
    expect(lastShown()).toMatchObject({ id: 'second', message: 'Battery low' })
    vi.useRealTimers()
  })

  it('never interrupts a question and follows it once it is answered', () => {
    const run = vi.fn()
    notice.show({ id: 'first', message: 'Update Instagram?', confirm: { label: 'Update', run } })
    notice.show({ id: 'second', message: 'Update available', waitForTurn: true, timeoutMs: 0 })
    expect(lastShown().message).toBe('Update Instagram?')
    notice.handlers['notice/confirm']()
    expect(run).toHaveBeenCalledTimes(1)
    expect(lastShown().message).toBe('Update available')
  })

  it('keeps waiting while the answer to a question puts up its own notice', () => {
    const run = () => notice.show({ id: 'first', message: 'Installing…', busy: true, pill: true, timeoutMs: 0 })
    notice.show({ id: 'first', message: 'Update Instagram?', confirm: { label: 'Update', run } })
    notice.show({ id: 'second', message: 'Update available', waitForTurn: true, timeoutMs: 0 })
    notice.handlers['notice/confirm']()
    expect(shownMessages()).toEqual(['Update Instagram?', 'Installing…'])
    notice.handlers['notice/dismiss']()
    expect(lastShown().message).toBe('Update available')
  })

  it('keeps waiting while a button opens a notice of its own', () => {
    const run = () => notice.show({ id: 'first', message: 'Opening…', busy: true, timeoutMs: 0 })
    notice.show({ id: 'first', message: 'Plugin is off', action: { label: 'Open plugins', run }, timeoutMs: 0 })
    notice.show({ id: 'second', message: 'Update available', waitForTurn: true, timeoutMs: 0 })
    expect(notice.handlers['notice/action']()).toEqual({ ok: true })
    expect(shownMessages()).toEqual(['Plugin is off', 'Opening…'])
    notice.handlers['notice/dismiss']()
    expect(lastShown().message).toBe('Update available')
  })

  it('takes its turn in the order it asked', () => {
    notice.show({ id: 'first', message: 'one', timeoutMs: 0 })
    notice.show({ id: 'second', message: 'two', waitForTurn: true, timeoutMs: 0 })
    notice.show({ id: 'third', message: 'three', waitForTurn: true, timeoutMs: 0 })
    notice.handlers['notice/dismiss']()
    notice.handlers['notice/dismiss']()
    expect(shownMessages()).toEqual(['one', 'two', 'three'])
  })

  it('keeps only the latest request for the same notice while it waits', () => {
    notice.show({ id: 'first', message: 'one', timeoutMs: 0 })
    notice.show({ id: 'second', message: 'old', waitForTurn: true, timeoutMs: 0 })
    notice.show({ id: 'second', message: 'new', waitForTurn: true, timeoutMs: 0 })
    notice.handlers['notice/dismiss']()
    notice.handlers['notice/dismiss']()
    expect(shownMessages()).toEqual(['one', 'new'])
  })

  it('updates itself in place when it is the notice on screen', () => {
    notice.show({ id: 'first', message: 'old', waitForTurn: true, timeoutMs: 0 })
    notice.show({ id: 'first', message: 'new', waitForTurn: true, timeoutMs: 0 })
    expect(shownMessages()).toEqual(['old', 'new'])
  })

  it('is dropped when dismissed by id before its turn comes', () => {
    notice.show({ id: 'first', message: 'one', timeoutMs: 0 })
    notice.show({ id: 'second', message: 'two', waitForTurn: true, timeoutMs: 0 })
    notice.dismiss('second')
    expect(lastShown().message).toBe('one')
    notice.handlers['notice/dismiss']()
    expect(shownMessages()).toEqual(['one'])
    expect(sent.at(-1).channel).toBe('notice/hide')
  })

  it('does not hold back a notice that did not ask to wait', () => {
    notice.show({ id: 'first', message: 'one', waitForTurn: true, timeoutMs: 0 })
    notice.show({ id: 'second', message: 'two', timeoutMs: 0 })
    expect(lastShown().message).toBe('two')
  })

  it('comes back once a notice that did not ask to wait has taken its place and gone', () => {
    notice.show({ id: 'first', message: 'Restart required', waitForTurn: true, timeoutMs: 0 })
    notice.show({ id: 'second', message: 'Opened report.pdf', timeoutMs: 0 })
    notice.handlers['notice/dismiss']()
    expect(shownMessages()).toEqual(['Restart required', 'Opened report.pdf', 'Restart required'])
  })

  it('never keeps a later waiting notice behind one that stays until dismissed', () => {
    notice.show({ id: 'first', message: 'Restart required', waitForTurn: true, timeoutMs: 0 })
    notice.show({ id: 'second', message: 'Battery low', waitForTurn: true, timeoutMs: 0 })
    expect(lastShown().message).toBe('Battery low')
    notice.handlers['notice/dismiss']()
    expect(lastShown().message).toBe('Restart required')
    notice.handlers['notice/dismiss']()
    expect(sent.at(-1).channel).toBe('notice/hide')
  })

  it('waits behind a question even when that question waited for its own turn', () => {
    const run = vi.fn()
    notice.show({ id: 'first', message: 'Restart now?', waitForTurn: true, confirm: { label: 'Restart', run } })
    notice.show({ id: 'second', message: 'Battery low', waitForTurn: true, timeoutMs: 0 })
    expect(lastShown().message).toBe('Restart now?')
    notice.handlers['notice/confirm']()
    expect(run).toHaveBeenCalledTimes(1)
    expect(lastShown().message).toBe('Battery low')
  })

  it('keeps the answer of a waiting question that a notice the user caused pushed aside', () => {
    const run = vi.fn()
    const onCancel = vi.fn()
    notice.show({ id: 'first', message: 'Restart now?', waitForTurn: true, confirm: { label: 'Restart', run, onCancel } })
    notice.show({ id: 'second', message: 'Opened report.pdf', timeoutMs: 0 })
    notice.handlers['notice/dismiss']()
    expect(onCancel).not.toHaveBeenCalled()
    expect(lastShown().message).toBe('Restart now?')
    notice.handlers['notice/confirm']()
    expect(run).toHaveBeenCalledTimes(1)
  })
})

describe('shellNotice answers only the notice that was clicked', () => {
  afterEach(() => {
    for (const id of ['backup', 'restart']) notice.dismiss(id)
  })

  it('ignores a button on a notice that a notice on another display has since replaced', () => {
    const openBackup = vi.fn()
    const restart = vi.fn()
    notice.show({ id: 'backup', message: 'Backup failed', action: { label: 'Open', run: openBackup }, waitForTurn: true })
    const stale = lastShown()
    cursorDisplayId = 2
    notice.show({ id: 'restart', message: 'Restart required', action: { label: 'Restart', run: restart }, waitForTurn: true, timeoutMs: 0 })
    expect(stale.displayId).toBe(1)
    expect(lastShown()).toMatchObject({ id: 'restart', displayId: 2 })
    expect(notice.handlers['notice/action'](null, stale.id)).toEqual({ ok: false })
    expect(restart).not.toHaveBeenCalled()
    expect(openBackup).not.toHaveBeenCalled()
    expect(sent.at(-1)).toMatchObject({ channel: 'notice/show', payload: { id: 'restart' } })
  })

  it('runs the button of the notice on screen', () => {
    const restart = vi.fn()
    notice.show({ id: 'restart', message: 'Restart required', action: { label: 'Restart', run: restart }, waitForTurn: true, timeoutMs: 0 })
    expect(notice.handlers['notice/action'](null, 'restart')).toEqual({ ok: true })
    expect(restart).toHaveBeenCalledTimes(1)
  })

  it('leaves the notice on screen alone when a replaced one is closed, and drops the replaced one', () => {
    notice.show({ id: 'backup', message: 'Backup failed', waitForTurn: true, timeoutMs: 0 })
    notice.show({ id: 'restart', message: 'Restart required', waitForTurn: true, timeoutMs: 0 })
    notice.handlers['notice/dismiss'](null, 'backup')
    expect(sent.at(-1)).toMatchObject({ channel: 'notice/show', payload: { id: 'restart' } })
    notice.handlers['notice/dismiss'](null, 'restart')
    expect(sent.at(-1).channel).toBe('notice/hide')
  })

  it('ignores an answer to a question that is no longer on screen', () => {
    const run = vi.fn()
    notice.show({ id: 'backup', message: 'Restore now?', confirm: { label: 'Restore', run } })
    notice.show({ id: 'restart', message: 'Opened report.pdf', timeoutMs: 0 })
    expect(notice.handlers['notice/confirm'](null, 'backup')).toEqual({ ok: false })
    expect(run).not.toHaveBeenCalled()
    expect(lastShown().id).toBe('restart')
  })

  it('gives every notice raised without an id one of its own', () => {
    const first = notice.show({ message: 'one', timeoutMs: 0 })
    const second = notice.show({ message: 'two', timeoutMs: 0 })
    expect(first).not.toBe(second)
  })
})

describe('shellNotice while a full-screen app is in front', () => {
  const shownMessages = () => sent.filter((e) => e.channel === 'notice/show').map((e) => e.payload.message)
  let fullScreen

  beforeEach(() => {
    vi.useFakeTimers()
    fullScreen = true
    notice.setFullScreenAppProbe(() => fullScreen)
  })

  afterEach(() => {
    notice.setFullScreenAppProbe(null)
    for (const id of ['first', 'second']) notice.dismiss(id)
    vi.useRealTimers()
  })

  it('holds a background notice back until the full-screen app leaves the front', () => {
    notice.show({ id: 'first', message: 'Restart required', waitForTurn: true, timeoutMs: 0 })
    vi.advanceTimersByTime(10000)
    expect(shownMessages()).toEqual([])
    fullScreen = false
    vi.advanceTimersByTime(2000)
    expect(shownMessages()).toEqual(['Restart required'])
  })

  it('still shows a notice the user caused', () => {
    notice.show({ id: 'first', message: 'Opened report.pdf', timeoutMs: 0 })
    expect(shownMessages()).toEqual(['Opened report.pdf'])
  })

  it('does not bring a held notice forward when the notice the user caused goes', () => {
    notice.show({ id: 'first', message: 'Opened report.pdf', timeoutMs: 0 })
    notice.show({ id: 'second', message: 'Battery low', waitForTurn: true, timeoutMs: 0 })
    notice.handlers['notice/dismiss'](null, 'first')
    expect(shownMessages()).toEqual(['Opened report.pdf'])
    fullScreen = false
    vi.advanceTimersByTime(2000)
    expect(shownMessages()).toEqual(['Opened report.pdf', 'Battery low'])
  })

  it('takes a background notice off screen when a full-screen app comes to the front, and puts it back after', () => {
    fullScreen = false
    notice.show({ id: 'first', message: 'Battery low', waitForTurn: true, timeoutMs: 0 })
    fullScreen = true
    vi.advanceTimersByTime(2000)
    expect(sent.at(-1).channel).toBe('notice/hide')
    fullScreen = false
    vi.advanceTimersByTime(2000)
    expect(shownMessages()).toEqual(['Battery low', 'Battery low'])
    expect(sent.at(-1).channel).toBe('notice/show')
  })

  it('leaves a question on screen', () => {
    fullScreen = false
    notice.show({ id: 'first', message: 'Restart now?', waitForTurn: true, confirm: { label: 'Restart', run: vi.fn() } })
    fullScreen = true
    vi.advanceTimersByTime(4000)
    expect(sent.at(-1).channel).toBe('notice/show')
  })

  it('stops asking once no background notice is left', () => {
    const probe = vi.fn(() => false)
    notice.setFullScreenAppProbe(probe)
    notice.show({ id: 'first', message: 'Battery low', waitForTurn: true, timeoutMs: 0 })
    notice.dismiss('first')
    probe.mockClear()
    vi.advanceTimersByTime(10000)
    expect(probe).not.toHaveBeenCalled()
  })
})

describe('shellNotice tells whoever raised a notice when it shows and when it goes', () => {
  afterEach(() => {
    for (const id of ['balloon', 'other']) notice.dismiss(id)
    vi.useRealTimers()
  })

  function balloon(extra = {}) {
    return { id: 'balloon', message: 'Backup failed', waitForTurn: true, onShown: vi.fn(), onClose: vi.fn(), ...extra }
  }

  it('reports the notice once it reaches the screen, not while it waits', () => {
    const request = balloon()
    notice.show({ id: 'other', message: 'Reading report.pdf', busy: true, timeoutMs: 0 })
    notice.show(request)
    expect(request.onShown).not.toHaveBeenCalled()
    notice.dismiss('other')
    expect(request.onShown).toHaveBeenCalledTimes(1)
  })

  it('says it timed out', () => {
    vi.useFakeTimers()
    const request = balloon({ timeoutMs: 10 })
    notice.show(request)
    vi.advanceTimersByTime(50)
    expect(request.onClose.mock.calls).toEqual([['timeout']])
  })

  it('says the user dismissed it', () => {
    const request = balloon()
    notice.show(request)
    notice.handlers['notice/dismiss'](null, 'balloon')
    expect(request.onClose.mock.calls).toEqual([['dismissed']])
  })

  it('says it was withdrawn when whoever raised it takes it down', () => {
    const request = balloon()
    notice.show(request)
    notice.dismiss('balloon')
    expect(request.onClose.mock.calls).toEqual([['withdrawn']])
  })

  it('says it was replaced when a newer request for the same notice takes its place', () => {
    const older = balloon()
    const newer = balloon({ message: 'Backup failed again' })
    notice.show(older)
    notice.show(newer)
    expect(older.onClose.mock.calls).toEqual([['replaced']])
    expect(newer.onShown).toHaveBeenCalledTimes(1)
    expect(newer.onClose).not.toHaveBeenCalled()
  })

  it('says its button was used', () => {
    const request = balloon({ action: { label: 'Open', run: vi.fn() } })
    notice.show(request)
    notice.handlers['notice/action'](null, 'balloon')
    expect(request.onClose.mock.calls).toEqual([['action']])
  })

  it('says nothing about a notice that never reached the screen', () => {
    const request = balloon()
    notice.show({ id: 'other', message: 'Reading report.pdf', busy: true, timeoutMs: 0 })
    notice.show(request)
    notice.dismiss('balloon')
    expect(request.onShown).not.toHaveBeenCalled()
    expect(request.onClose).not.toHaveBeenCalled()
  })

  it('reports a notice that stepped aside and came back only once each way', () => {
    const request = balloon({ timeoutMs: 0 })
    notice.show(request)
    notice.show({ id: 'other', message: 'Battery low', waitForTurn: true, timeoutMs: 0 })
    expect(request.onClose).not.toHaveBeenCalled()
    notice.handlers['notice/dismiss'](null, 'other')
    expect(lastShown().id).toBe('balloon')
    notice.handlers['notice/dismiss'](null, 'balloon')
    expect(request.onShown).toHaveBeenCalledTimes(1)
    expect(request.onClose.mock.calls).toEqual([['dismissed']])
  })
})

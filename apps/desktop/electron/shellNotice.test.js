import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'

const { default: notice } = await import('./modules/shellNotice.js')

let sent

beforeEach(() => {
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

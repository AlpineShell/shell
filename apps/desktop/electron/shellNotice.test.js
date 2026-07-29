import { describe, expect, it, beforeEach, vi } from 'vitest'

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

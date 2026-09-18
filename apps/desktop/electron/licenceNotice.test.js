import { describe, expect, it, vi } from 'vitest'

const { createLicenceNotice, graceNoticeMessage, NOTICE_REPEAT_MS } = await import('./licenceNotice.js')

const NOW = Date.UTC(2026, 8, 18, 12, 0, 0)
const DAY_MS = 24 * 60 * 60 * 1000

function graceStatus(overrides = {}) {
  return {
    state: 'grace',
    reason: 'expired',
    graceUntil: new Date(NOW + 10 * DAY_MS).toISOString(),
    movedTo: null,
    ...overrides,
  }
}

function makeNotice(initialNow = NOW) {
  let current = initialNow
  const show = vi.fn()
  const openLicenceWindow = vi.fn()
  const notice = createLicenceNotice({ show, openLicenceWindow, now: () => current })
  return { notice, show, openLicenceWindow, advance: (ms) => { current += ms } }
}

describe('the grace notice', () => {
  it('shows a sticky notice with a Sign in confirm that opens the licence window', () => {
    const { notice, show, openLicenceWindow } = makeNotice()
    expect(notice.observe(graceStatus())).toBe(true)
    expect(show).toHaveBeenCalledTimes(1)
    const request = show.mock.calls[0][0]
    expect(request).toMatchObject({ id: 'licence', title: 'Licence needs attention', timeoutMs: 0, confirm: { label: 'Sign in', cancelLabel: 'Not now' } })
    request.confirm.run()
    expect(openLicenceWindow).toHaveBeenCalledTimes(1)
  })

  it('stays silent for every state but grace', () => {
    const { notice, show } = makeNotice()
    for (const state of ['development', 'valid', 'unlicensed', 'lapsed']) expect(notice.observe(graceStatus({ state }))).toBe(false)
    expect(notice.observe(null)).toBe(false)
    expect(show).not.toHaveBeenCalled()
  })

  it('repeats the same notice at most once per day', () => {
    const { notice, show, advance } = makeNotice()
    notice.observe(graceStatus())
    advance(NOTICE_REPEAT_MS - 1)
    expect(notice.observe(graceStatus())).toBe(false)
    advance(1)
    expect(notice.observe(graceStatus())).toBe(true)
    expect(show).toHaveBeenCalledTimes(2)
  })

  it('shows a different reason at once', () => {
    const { notice, show } = makeNotice()
    notice.observe(graceStatus())
    expect(notice.observe(graceStatus({ reason: 'moved', movedTo: 'LAPTOP-2' }))).toBe(true)
    expect(show).toHaveBeenCalledTimes(2)
    expect(show.mock.calls[1][0].message).toContain('moved to LAPTOP-2')
  })

  it('words each reason and names the day Explorer comes back in every grace message', () => {
    for (const reason of ['expired', 'refunded', 'upgrade', 'moved', 'disputed', 'released', 'conflict', 'secret-unreadable']) {
      expect(graceNoticeMessage(graceStatus({ reason, movedTo: 'DESK-1' }))).toContain('Windows Explorer comes back unless you sign in')
    }
    expect(graceNoticeMessage(graceStatus())).toContain('Alpine Shell could not renew its licence.')
    expect(graceNoticeMessage(graceStatus({ reason: 'refunded' }))).toContain('This purchase was refunded.')
    expect(graceNoticeMessage(graceStatus({ reason: 'upgrade' }))).toContain('Alpine Shell now needs a licence.')
    expect(graceNoticeMessage(graceStatus({ reason: 'moved', movedTo: 'DESK-1' }))).toContain('This licence was moved to DESK-1.')
  })
})

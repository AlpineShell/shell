import { describe, it, expect, vi } from 'vitest'
import pendingRestartPolicy from './pendingRestartPolicy.js'

const {
  PENDING_RESTART_NOTICE_ID,
  REMIND_AFTER_MS,
  pendingRestartStep,
  pendingRestartNotice,
} = pendingRestartPolicy

const NOW = 1_800_000_000_000

describe('pendingRestartStep', () => {
  it('announces a restart Windows Update left pending', () => {
    expect(pendingRestartStep(true, null, NOW)).toEqual({ action: 'show', announcedAt: NOW })
  })

  it('does not announce it again on every check', () => {
    expect(pendingRestartStep(true, NOW, NOW + 5 * 60 * 1000)).toEqual({ action: null, announcedAt: NOW })
    expect(pendingRestartStep(true, NOW, NOW + REMIND_AFTER_MS - 1)).toEqual({ action: null, announcedAt: NOW })
  })

  it('reminds once a day while the restart is still pending', () => {
    expect(REMIND_AFTER_MS).toBe(24 * 60 * 60 * 1000)
    expect(pendingRestartStep(true, NOW, NOW + REMIND_AFTER_MS)).toEqual({ action: 'show', announcedAt: NOW + REMIND_AFTER_MS })
  })

  it('takes the notice down when nothing is pending any more', () => {
    expect(pendingRestartStep(false, NOW, NOW + 1000)).toEqual({ action: 'dismiss', announcedAt: null })
  })

  it('does nothing while no restart is pending', () => {
    expect(pendingRestartStep(false, null, NOW)).toEqual({ action: null, announcedAt: null })
  })
})

describe('pendingRestartNotice', () => {
  it('stays until answered, waits for its turn and restarts from its button', () => {
    const restart = vi.fn()
    const request = pendingRestartNotice(restart)
    expect(request).toMatchObject({
      id: PENDING_RESTART_NOTICE_ID,
      title: 'Restart required',
      message: 'Windows needs to restart to finish installing updates.',
      action: { label: 'Restart' },
      timeoutMs: 0,
      waitForTurn: true,
    })
    request.action.run()
    expect(restart).toHaveBeenCalledTimes(1)
  })
})

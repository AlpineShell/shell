import { describe, expect, it } from 'vitest'

const { default: devKeys } = await import('./devKeys.js')
const { KEY_HELP, actionForKey, nextLauncherState } = devKeys

describe('actionForKey', () => {
  it('restarts Electron on r', () => {
    expect(actionForKey('r')).toBe('restart')
  })

  it('restarts with fresh deps on capital R', () => {
    expect(actionForKey('R')).toBe('restartFresh')
  })

  it('quits on q and on Ctrl+C', () => {
    expect(actionForKey('q')).toBe('quit')
    expect(actionForKey('\x03')).toBe('quit')
  })

  it('ignores every other key', () => {
    for (const key of ['x', 'Q', '\r', '\x1b', 'rr', '', 'toString', '__proto__']) {
      expect(actionForKey(key)).toBeNull()
    }
  })

  it('lists only keys that map to an action', () => {
    for (const { key } of KEY_HELP) expect(actionForKey(key)).not.toBeNull()
  })
})

describe('nextLauncherState', () => {
  it('ignores restart keys until the app has started', () => {
    expect(nextLauncherState('starting', 'restart')).toEqual({ state: 'starting', effect: null })
    expect(nextLauncherState('starting', 'restartFresh')).toEqual({ state: 'starting', effect: null })
  })

  it('becomes running once the app is ready', () => {
    expect(nextLauncherState('starting', 'ready')).toEqual({ state: 'running', effect: null })
  })

  it('restarts only Electron on restart', () => {
    expect(nextLauncherState('running', 'restart')).toEqual({ state: 'restarting', effect: 'restartElectron' })
  })

  it('restarts Vite and Electron on restartFresh', () => {
    expect(nextLauncherState('running', 'restartFresh')).toEqual({ state: 'restarting', effect: 'restartViteAndElectron' })
  })

  it('ignores repeated restart presses while a restart is in progress', () => {
    expect(nextLauncherState('restarting', 'restart')).toEqual({ state: 'restarting', effect: null })
    expect(nextLauncherState('restarting', 'restartFresh')).toEqual({ state: 'restarting', effect: null })
  })

  it('returns to running when the restart finishes', () => {
    expect(nextLauncherState('restarting', 'restarted')).toEqual({ state: 'running', effect: null })
  })

  it('quits from any live state, including mid-restart', () => {
    for (const state of ['starting', 'running', 'restarting']) {
      expect(nextLauncherState(state, 'quit')).toEqual({ state: 'exiting', effect: 'quit' })
    }
  })

  it('ignores everything once exiting', () => {
    for (const event of ['quit', 'restart', 'restartFresh', 'ready', 'restarted']) {
      expect(nextLauncherState('exiting', event)).toEqual({ state: 'exiting', effect: null })
    }
  })

  it('does not treat a stray ready or restarted as a state change', () => {
    expect(nextLauncherState('running', 'ready')).toEqual({ state: 'running', effect: null })
    expect(nextLauncherState('running', 'restarted')).toEqual({ state: 'running', effect: null })
  })
})

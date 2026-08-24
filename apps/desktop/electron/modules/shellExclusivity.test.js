import { describe, it, expect } from 'vitest'
import shellExclusivity from './shellExclusivity.js'

const {
  ENSURE_SHELL_REGISTRATION,
  EXIT_ALPINE,
  REVERT_BLOCKED_IN_DEVELOPMENT,
  REVERT_BLOCKED_BY_UPDATE,
  planShellActivation,
  requiresShellRegistration,
  isRegistrationSatisfied,
  revertBlockedReason,
  planShellRevert,
  settleShellRevert,
  planMarkerAge,
} = shellExclusivity

function activation(overrides = {}) {
  return planShellActivation({
    packaged: true,
    forceTakeover: false,
    firstRun: false,
    optedOut: false,
    updateInProgress: false,
    handedToExplorer: false,
    gpoBlocked: false,
    shellRegisteredToAlpine: true,
    ...overrides,
  })
}

const CONTEXT_KEYS = [
  'packaged',
  'forceTakeover',
  'firstRun',
  'optedOut',
  'updateInProgress',
  'handedToExplorer',
  'gpoBlocked',
  'shellRegisteredToAlpine',
]

const EVERY_CONTEXT = Array.from({ length: 2 ** CONTEXT_KEYS.length }, (_unused, mask) =>
  Object.fromEntries(CONTEXT_KEYS.map((key, index) => [key, Boolean(mask & (1 << index))])))

describe('planShellActivation', () => {
  it('registers Alpine as the shell', () => {
    expect(activation().steps).toEqual([ENSURE_SHELL_REGISTRATION])
  })

  it('never asks anything to terminate explorer', () => {
    for (const context of EVERY_CONTEXT) {
      expect(planShellActivation(context).steps.every(step => step === ENSURE_SHELL_REGISTRATION)).toBe(true)
    }
  })

  it('does not fight a Group Policy shell override', () => {
    const plan = activation({ gpoBlocked: true })
    expect(plan.steps).toEqual([ENSURE_SHELL_REGISTRATION])
    expect(plan.actingAsShell).toBe(true)
  })

  it('stops acting as the shell when policy hands it to explorer', () => {
    const plan = activation({ gpoBlocked: true, shellRegisteredToAlpine: false })
    expect(plan.actingAsShell).toBe(false)
  })

  it('previews the shell during first run without touching the registration', () => {
    const plan = activation({ firstRun: true, shellRegisteredToAlpine: false })
    expect(plan.steps).toEqual([])
    expect(plan.actingAsShell).toBe(true)
  })

  it('claims the shell during first run once setup has registered Alpine', () => {
    expect(activation({ firstRun: true, shellRegisteredToAlpine: true }).steps).toEqual([ENSURE_SHELL_REGISTRATION])
  })

  it('changes nothing in development unless the takeover is forced', () => {
    const plan = activation({ packaged: false, shellRegisteredToAlpine: true })
    expect(plan.steps).toEqual([])
    expect(plan.actingAsShell).toBe(true)
  })

  it('previews without registry writes when development forces the takeover', () => {
    const plan = activation({ packaged: false, forceTakeover: true, shellRegisteredToAlpine: false })
    expect(plan.steps).toEqual([])
    expect(plan.actingAsShell).toBe(true)
  })
})

describe('planShellActivation respects a permanent revert', () => {
  it('never rewrites the registration for a user who opted out', () => {
    const plan = activation({ optedOut: true, shellRegisteredToAlpine: false })
    expect(plan.steps).toEqual([])
    expect(plan.actingAsShell).toBe(false)
  })

  it('never registers Alpine for a user who opted out', () => {
    for (const context of EVERY_CONTEXT.filter(c => c.packaged && c.optedOut)) {
      expect(requiresShellRegistration(planShellActivation(context))).toBe(false)
    }
  })

  it('stays out of the way when the user opted out and has not run setup again', () => {
    const plan = activation({ firstRun: true, optedOut: true, shellRegisteredToAlpine: false })
    expect(plan.steps).toEqual([])
    expect(plan.actingAsShell).toBe(false)
  })
})

describe('planShellActivation respects a temporary revert', () => {
  it('leaves explorer as the shell while the hand-off is in effect', () => {
    const plan = activation({ handedToExplorer: true, shellRegisteredToAlpine: false })
    expect(plan.steps).toEqual([])
    expect(plan.actingAsShell).toBe(false)
  })

  it('idles while the hand-off is in effect even once the registration points back at Alpine', () => {
    const plan = activation({ handedToExplorer: true, shellRegisteredToAlpine: true })
    expect(plan.steps).toEqual([])
    expect(plan.actingAsShell).toBe(false)
  })

  it('claims the shell again once the hand-off is over', () => {
    expect(activation({ handedToExplorer: false }).steps).toEqual([ENSURE_SHELL_REGISTRATION])
  })
})

describe('planShellActivation respects an update in progress', () => {
  it('never rewrites the registration while an update owns it', () => {
    for (const context of EVERY_CONTEXT.filter(c => c.packaged && !c.optedOut && c.updateInProgress)) {
      expect(planShellActivation(context).steps).toEqual([])
    }
  })

  it('claims the shell again once the update marker is gone', () => {
    expect(activation({ updateInProgress: false }).steps).toEqual([ENSURE_SHELL_REGISTRATION])
  })
})

describe('planShellActivation ordering invariants', () => {
  it('never registers Alpine while Group Policy owns the shell in an unpackaged build', () => {
    for (const context of EVERY_CONTEXT.filter(c => !c.packaged)) {
      expect(requiresShellRegistration(planShellActivation(context))).toBe(false)
    }
  })

  it('only reads the inputs a decision needs', () => {
    const read = []
    const context = {}
    for (const key of CONTEXT_KEYS) {
      Object.defineProperty(context, key, {
        get() {
          read.push(key)
          return key === 'packaged' || key === 'optedOut'
        },
      })
    }
    planShellActivation(context)
    expect(read).toEqual(['packaged', 'optedOut', 'shellRegisteredToAlpine'])
  })
})

describe('isRegistrationSatisfied', () => {
  it('holds a plan that registers Alpine to a verified registration', () => {
    const plan = activation()
    expect(isRegistrationSatisfied(plan, false)).toBe(false)
    expect(isRegistrationSatisfied(plan, true)).toBe(true)
  })

  it('lets a preview act as the shell without a registration', () => {
    const plan = activation({ firstRun: true, shellRegisteredToAlpine: false })
    expect(isRegistrationSatisfied(plan, false)).toBe(true)
  })
})

describe('revertBlockedReason', () => {
  it('allows a revert from the installed app', () => {
    expect(revertBlockedReason({ packaged: true, updatePending: false })).toBe(null)
  })

  it('blocks a revert in development', () => {
    expect(revertBlockedReason({ packaged: false, updatePending: false })).toBe(REVERT_BLOCKED_IN_DEVELOPMENT)
  })

  it('blocks a revert while an update owns the shell registration', () => {
    expect(revertBlockedReason({ packaged: true, updatePending: true })).toBe(REVERT_BLOCKED_BY_UPDATE)
  })
})

describe('planShellRevert', () => {
  it('exits Alpine once the registration points at explorer and the helper is running', () => {
    expect(planShellRevert({ shellHandedToExplorer: true, replacementConfirmed: true }).steps).toEqual([EXIT_ALPINE])
  })

  it('keeps Alpine alive while the registration still points at Alpine', () => {
    expect(planShellRevert({ shellHandedToExplorer: false, replacementConfirmed: true }).steps).toEqual([])
  })

  it('keeps Alpine alive when nothing is confirmed to bring explorer back', () => {
    expect(planShellRevert({ shellHandedToExplorer: true, replacementConfirmed: false }).steps).toEqual([])
  })

  it('never exits without both the hand-off and a live replacement', () => {
    for (const shellHandedToExplorer of [true, false]) {
      for (const replacementConfirmed of [true, false]) {
        const { steps } = planShellRevert({ shellHandedToExplorer, replacementConfirmed })
        expect(steps.includes(EXIT_ALPINE)).toBe(shellHandedToExplorer && replacementConfirmed)
      }
    }
  })
})

describe('settleShellRevert', () => {
  function startedRevert(overrides = {}) {
    return {
      success: true,
      error: null,
      abandonHandoff: () => ({ success: false, error: 'explorer never came back' }),
      ...overrides,
    }
  }

  it('keeps the reported success when the replacement is confirmed', () => {
    expect(settleShellRevert(startedRevert(), true)).toMatchObject({ success: true, error: null })
  })

  it('reports the failure when the helper is gone by the time it is re-checked', () => {
    const settled = settleShellRevert(startedRevert(), false)
    expect(settled.success).toBe(false)
    expect(settled.error).toBe('explorer never came back')
  })

  it('never claims success once the helper it depended on has died', () => {
    for (const leftBehind of [[], ['C']]) {
      expect(settleShellRevert(startedRevert({ leftBehind }), false).success).toBe(false)
    }
  })

  it('leaves an already-failed revert alone without abandoning anything twice', () => {
    const started = startedRevert({
      success: false,
      error: 'the registration never moved',
      abandonHandoff: () => { throw new Error('must not abandon a revert that never started') },
    })
    expect(settleShellRevert(started, false)).toBe(started)
  })

  it('keeps the directories the uninstall could not remove when it abandons', () => {
    const started = startedRevert({ leftBehind: ['left-on-disk'] })
    expect(settleShellRevert(started, false).leftBehind).toEqual(['left-on-disk'])
  })
})

describe('planMarkerAge', () => {
  const maxAgeMs = 1000

  it('treats a missing marker as inactive', () => {
    expect(planMarkerAge({ ageMs: null, maxAgeMs })).toEqual({ active: false, restamp: false })
  })

  it('keeps a fresh marker active', () => {
    expect(planMarkerAge({ ageMs: 999, maxAgeMs })).toEqual({ active: true, restamp: false })
  })

  it('expires a marker that outlived its bound, so it can never lock Alpine out for good', () => {
    expect(planMarkerAge({ ageMs: 1000, maxAgeMs })).toEqual({ active: false, restamp: false })
    expect(planMarkerAge({ ageMs: 10 ** 12, maxAgeMs })).toEqual({ active: false, restamp: false })
  })

  it('restamps a future-dated marker instead of honouring it forever', () => {
    expect(planMarkerAge({ ageMs: -(10 ** 9), maxAgeMs })).toEqual({ active: true, restamp: true })
  })

  it('bounds a clock-skewed marker once it has been restamped', () => {
    const skewed = planMarkerAge({ ageMs: -5000, maxAgeMs })
    expect(skewed.restamp).toBe(true)
    expect(planMarkerAge({ ageMs: maxAgeMs, maxAgeMs }).active).toBe(false)
  })

  it('ignores the uptime it was not given', () => {
    expect(planMarkerAge({ ageMs: 500, maxAgeMs })).toEqual({ active: true, restamp: false })
  })

  it('keeps a marker stamped during this boot active', () => {
    expect(planMarkerAge({ ageMs: 500, maxAgeMs, systemUptimeMs: 900 })).toEqual({ active: true, restamp: false })
  })

  it('expires a marker that did not survive the reboot it was meant to bracket', () => {
    expect(planMarkerAge({ ageMs: 500, maxAgeMs, systemUptimeMs: 100 })).toEqual({ active: false, restamp: false })
  })

  it('frees a fresh marker whose operation a power cut interrupted', () => {
    const interrupted = planMarkerAge({ ageMs: 1, maxAgeMs: 15 * 60 * 1000, systemUptimeMs: 0 })
    expect(interrupted.active).toBe(false)
  })
})

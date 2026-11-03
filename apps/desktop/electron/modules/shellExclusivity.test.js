import { describe, it, expect } from 'vitest'
import shellExclusivity from './shellExclusivity.js'

const {
  ENSURE_SHELL_REGISTRATION,
  EXIT_ALPINE,
  REVERT_BLOCKED_IN_DEVELOPMENT,
  REVERT_BLOCKED_BY_UPDATE,
  REVERT_BLOCKED_IN_TEST_SESSION,
  REVERT_BLOCKED_WITHOUT_TEST_SESSION,
  planShellActivation,
  requiresShellRegistration,
  isRegistrationSatisfied,
  revertBlockedReason,
  RESTART_BLOCKED_IN_DEVELOPMENT,
  RESTART_BLOCKED_WHEN_NOT_INSTALLED,
  RESTART_BLOCKED_BY_UPDATE,
  RESTART_BLOCKED_IN_TEST_SESSION,
  restartBlockedReason,
  planAutostartLaunch,
  shouldProcessAutostart,
  matchHandoffLogon,
  updateHandsShellBackToAlpine,
  planShellRevert,
  settleShellRevert,
  planMarkerAge,
  SHOW_SETUP,
  START_SHELL,
  exitsWithoutRunningShell,
  planShellStartup,
  shouldRetireExplorerBesideShell,
} = shellExclusivity

describe('exitsWithoutRunningShell', () => {
  it('exits a link or file launch when Alpine Shell is not already running', () => {
    expect(exitsWithoutRunningShell({ packaged: true, launchedForLinkOrFile: true })).toBe(true)
  })

  it('keeps a plain launch', () => {
    expect(exitsWithoutRunningShell({ packaged: true, launchedForLinkOrFile: false })).toBe(false)
  })

  it('keeps link and file launches in development', () => {
    expect(exitsWithoutRunningShell({ packaged: false, launchedForLinkOrFile: true })).toBe(false)
  })
})

describe('planShellStartup', () => {
  function startup(overrides = {}) {
    return planShellStartup({ packaged: true, optedOut: false, launchedByHand: true, explorerHoldsDesktop: false, ...overrides }).action
  }

  it('starts the shell when Explorer does not hold the desktop', () => {
    expect(startup()).toBe(START_SHELL)
  })

  it('starts the shell when it cannot tell who holds the desktop', () => {
    expect(startup({ explorerHoldsDesktop: null })).toBe(START_SHELL)
  })

  it('exits instead of running beside Explorer', () => {
    expect(startup({ explorerHoldsDesktop: true })).toBe(EXIT_ALPINE)
    expect(startup({ explorerHoldsDesktop: true, launchedByHand: false })).toBe(EXIT_ALPINE)
  })

  it('shows setup again when someone starts Alpine after a permanent revert', () => {
    expect(startup({ optedOut: true, explorerHoldsDesktop: true })).toBe(SHOW_SETUP)
    expect(startup({ optedOut: true, explorerHoldsDesktop: false })).toBe(SHOW_SETUP)
  })

  it('exits a launch after a permanent revert that nobody started by hand', () => {
    expect(startup({ optedOut: true, launchedByHand: false })).toBe(EXIT_ALPINE)
  })

  it('always starts the shell in development', () => {
    expect(startup({ packaged: false, optedOut: true, explorerHoldsDesktop: true })).toBe(START_SHELL)
  })
})

describe('shouldRetireExplorerBesideShell', () => {
  it('retires Explorer when it takes the desktop beside the running shell', () => {
    expect(shouldRetireExplorerBesideShell({ explorerHoldsDesktop: true, updateInProgress: false })).toBe(true)
  })

  it('leaves Explorer alone while an update hands the desktop over', () => {
    expect(shouldRetireExplorerBesideShell({ explorerHoldsDesktop: true, updateInProgress: true })).toBe(false)
  })

  it('does nothing when Explorer does not hold the desktop or it cannot tell', () => {
    expect(shouldRetireExplorerBesideShell({ explorerHoldsDesktop: false, updateInProgress: false })).toBe(false)
    expect(shouldRetireExplorerBesideShell({ explorerHoldsDesktop: null, updateInProgress: false })).toBe(false)
  })
})

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

  it('blocks the install reverts during a test-out, which never registered Alpine Shell', () => {
    expect(revertBlockedReason({ packaged: true, updatePending: false, testSession: true })).toBe(REVERT_BLOCKED_IN_TEST_SESSION)
  })

  it('lets a test-out end itself', () => {
    expect(revertBlockedReason({ packaged: true, updatePending: false, testSession: true, endsTestSession: true })).toBe(null)
  })

  it('refuses to end a test-out that is not running', () => {
    expect(revertBlockedReason({ packaged: true, updatePending: false, endsTestSession: true })).toBe(REVERT_BLOCKED_WITHOUT_TEST_SESSION)
  })

  it('still blocks ending a test-out in development and during an update', () => {
    expect(revertBlockedReason({ packaged: false, updatePending: false, testSession: true, endsTestSession: true })).toBe(REVERT_BLOCKED_IN_DEVELOPMENT)
    expect(revertBlockedReason({ packaged: true, updatePending: true, testSession: true, endsTestSession: true })).toBe(REVERT_BLOCKED_BY_UPDATE)
  })
})

describe('restartBlockedReason', () => {
  const installed = { packaged: true, portable: false, updatePending: false, testSession: false }

  it('lets the installed shell restart itself', () => {
    expect(restartBlockedReason(installed)).toBe(null)
  })

  it('refuses in development, where the dev launcher owns the process', () => {
    expect(restartBlockedReason({ ...installed, packaged: false })).toBe(RESTART_BLOCKED_IN_DEVELOPMENT)
  })

  it('refuses a portable run, which would come back as the installer', () => {
    expect(restartBlockedReason({ ...installed, portable: true })).toBe(RESTART_BLOCKED_WHEN_NOT_INSTALLED)
  })

  it('refuses while an update owns the shell registration', () => {
    expect(restartBlockedReason({ ...installed, updatePending: true })).toBe(RESTART_BLOCKED_BY_UPDATE)
  })

  it('refuses during a test-out, whose helper would bring Explorer back', () => {
    expect(restartBlockedReason({ ...installed, testSession: true })).toBe(RESTART_BLOCKED_IN_TEST_SESSION)
  })
})

describe('planAutostartLaunch', () => {
  function autostartLaunch(overrides = {}) {
    return planAutostartLaunch({
      packaged: true,
      launchedByAutostart: true,
      handedOffThisLogon: true,
      explorerHostsShell: true,
      ...overrides,
    })
  }

  const EVERY_AUTOSTART_CONTEXT = [true, false].flatMap(packaged =>
    [true, false].flatMap(launchedByAutostart =>
      [true, false, null].flatMap(handedOffThisLogon =>
        [true, false, null].map(explorerHostsShell => ({ packaged, launchedByAutostart, handedOffThisLogon, explorerHostsShell })))))

  const exits = context => planAutostartLaunch(context).steps.includes(EXIT_ALPINE)

  it('exits the launch that Explorer starts from the Run entry in the sign-in the user reverted', () => {
    expect(autostartLaunch().steps).toEqual([EXIT_ALPINE])
  })

  it('keeps a launch the user started, even while Explorer holds the shell', () => {
    expect(autostartLaunch({ launchedByAutostart: false }).steps).toEqual([])
  })

  it('keeps the autostart launch at a later sign-in', () => {
    expect(autostartLaunch({ handedOffThisLogon: false }).steps).toEqual([])
  })

  it('keeps the autostart launch when the sign-in the hand-off belongs to is unknown', () => {
    expect(autostartLaunch({ handedOffThisLogon: null }).steps).toEqual([])
  })

  it('exits the launch that Explorer starts from the Run entry while an update installs', () => {
    expect(autostartLaunch({ handedOffThisLogon: false, updateInProgress: true }).steps).toEqual([EXIT_ALPINE])
  })

  it('keeps the autostart launch during an update unless Explorer is confirmed to host the shell', () => {
    expect(autostartLaunch({ handedOffThisLogon: false, updateInProgress: true, explorerHostsShell: null }).steps).toEqual([])
    expect(autostartLaunch({ handedOffThisLogon: false, updateInProgress: true, explorerHostsShell: false }).steps).toEqual([])
  })

  it('keeps the autostart launch unless Explorer is confirmed to host the shell', () => {
    expect(autostartLaunch({ explorerHostsShell: false }).steps).toEqual([])
    expect(autostartLaunch({ explorerHostsShell: null }).steps).toEqual([])
  })

  it('never exits in development', () => {
    expect(autostartLaunch({ packaged: false }).steps).toEqual([])
  })

  it('never exits a launch that did not come from the Run entry', () => {
    expect(EVERY_AUTOSTART_CONTEXT.filter(context => !context.launchedByAutostart).some(exits)).toBe(false)
  })

  it('never exits without positive confirmation of both the sign-in and Explorer', () => {
    const unconfirmed = EVERY_AUTOSTART_CONTEXT.filter(context => context.handedOffThisLogon !== true || context.explorerHostsShell !== true)
    expect(unconfirmed.some(exits)).toBe(false)
  })

  it('exits in exactly one context', () => {
    expect(EVERY_AUTOSTART_CONTEXT.filter(exits)).toHaveLength(1)
  })

  it('probes for Explorer only once a hand-off from this sign-in is confirmed', () => {
    const read = []
    const context = {}
    for (const key of ['packaged', 'launchedByAutostart', 'handedOffThisLogon', 'explorerHostsShell']) {
      Object.defineProperty(context, key, {
        get() {
          read.push(key)
          return key === 'handedOffThisLogon' ? null : true
        },
      })
    }
    planAutostartLaunch(context)
    expect(read).toEqual(['packaged', 'launchedByAutostart', 'handedOffThisLogon'])
  })
})

describe('shouldProcessAutostart', () => {
  function startupApps(overrides = {}) {
    return shouldProcessAutostart({
      development: false,
      updateRestart: false,
      actingAsShell: true,
      launchedByAutostart: false,
      ...overrides,
    })
  }

  it('starts the startup apps when Alpine is the shell', () => {
    expect(startupApps()).toBe(true)
  })

  it('leaves them to Explorer when Alpine is not acting as the shell', () => {
    expect(startupApps({ actingAsShell: false })).toBe(false)
  })

  it('leaves them to Explorer when its log-on pass started Alpine', () => {
    expect(startupApps({ launchedByAutostart: true })).toBe(false)
  })

  it('skips them in development and after an update restart', () => {
    expect(startupApps({ development: true })).toBe(false)
    expect(startupApps({ updateRestart: true })).toBe(false)
  })

  it('starts them only once per sign-in, so a restarted Alpine does not launch them twice', () => {
    expect(startupApps({ ranThisLogon: true })).toBe(false)
    expect(startupApps({ ranThisLogon: false })).toBe(true)
  })

  it('starts them when it cannot tell whether they already ran in this sign-in', () => {
    expect(startupApps({ ranThisLogon: null })).toBe(true)
  })

  it('does not look up the sign-in when Alpine is not the one to start the startup apps', () => {
    let lookedUp = false
    const context = {
      development: false,
      updateRestart: false,
      actingAsShell: false,
      launchedByAutostart: false,
      get ranThisLogon() {
        lookedUp = true
        return false
      },
    }
    expect(shouldProcessAutostart(context)).toBe(false)
    expect(lookedUp).toBe(false)
  })
})

describe('updateHandsShellBackToAlpine', () => {
  const ALPINE_SHELL = 'C:\\Users\\someone\\AppData\\Local\\Programs\\alpine-shell\\Alpine Shell.exe'

  it('hands the shell back to Alpine when Alpine was the shell before the update', () => {
    expect(updateHandsShellBackToAlpine({ previousShell: ALPINE_SHELL, optedOut: false })).toBe(true)
  })

  it('leaves Explorer as the shell for someone who runs Alpine on top of Explorer', () => {
    expect(updateHandsShellBackToAlpine({ previousShell: 'explorer.exe', optedOut: false })).toBe(false)
    expect(updateHandsShellBackToAlpine({ previousShell: 'C:\\Windows\\Explorer.EXE', optedOut: false })).toBe(false)
    expect(updateHandsShellBackToAlpine({ previousShell: null, optedOut: false })).toBe(false)
    expect(updateHandsShellBackToAlpine({ previousShell: '  ', optedOut: false })).toBe(false)
  })

  it('never makes Alpine the shell for someone who turned it off for good', () => {
    expect(updateHandsShellBackToAlpine({ previousShell: ALPINE_SHELL, optedOut: true })).toBe(false)
  })
})

describe('matchHandoffLogon', () => {
  it('matches a hand-off recorded in this sign-in', () => {
    expect(matchHandoffLogon({ recordedLogonId: 'S-1-5-5-0-43222286', currentLogonId: 'S-1-5-5-0-43222286' })).toBe(true)
  })

  it('tells a hand-off from an earlier sign-in apart', () => {
    expect(matchHandoffLogon({ recordedLogonId: 'S-1-5-5-0-43222286', currentLogonId: 'S-1-5-5-0-51000001' })).toBe(false)
  })

  it('cannot tell when either sign-in is unknown', () => {
    expect(matchHandoffLogon({ recordedLogonId: null, currentLogonId: 'S-1-5-5-0-43222286' })).toBe(null)
    expect(matchHandoffLogon({ recordedLogonId: 'S-1-5-5-0-43222286', currentLogonId: null })).toBe(null)
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

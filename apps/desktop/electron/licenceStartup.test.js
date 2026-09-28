import { describe, expect, it } from 'vitest'

const { planStartupForLicence } = await import('./licenceStartup.js')

const REASONS_WITHOUT_A_GENUINE_LICENCE = ['missing', 'unreadable', 'unverifiable']
const REASONS_WITH_A_LICENCE_FOR_ANOTHER_PROOF = ['device-mismatch', 'binding-mismatch']
const ALL_UNLICENSED_REASONS = [...REASONS_WITHOUT_A_GENUINE_LICENCE, ...REASONS_WITH_A_LICENCE_FOR_ANOTHER_PROOF]

function status(state, reason = null) {
  return { state, reason }
}

const installedWithExplorerAsShell = { packaged: true, shellRegisteredToAlpine: false }
const installedWithAlpineAsShell = { packaged: true, shellRegisteredToAlpine: true }
const runningFromSource = { packaged: false, shellRegisteredToAlpine: false }

describe('the startup plan for a licence', () => {
  it('starts the shell for every licence state once Alpine is the Windows shell, so a licence check can never take the desktop away', () => {
    for (const reason of ALL_UNLICENSED_REASONS) {
      expect(planStartupForLicence(status('unlicensed', reason), installedWithAlpineAsShell)).toEqual({ startShell: true, openSignIn: true })
    }
    for (const state of ['development', 'valid']) {
      expect(planStartupForLicence(status(state), installedWithAlpineAsShell).startShell).toBe(true)
    }
    expect(planStartupForLicence(null, installedWithAlpineAsShell).startShell).toBe(true)
  })

  it('holds an installed PC at setup while it has no genuine licence and Windows still starts Explorer', () => {
    for (const reason of REASONS_WITHOUT_A_GENUINE_LICENCE) {
      expect(planStartupForLicence(status('unlicensed', reason), installedWithExplorerAsShell)).toEqual({ startShell: false, openSignIn: false })
    }
  })

  it('keeps starting the shell on a PC whose genuine licence was issued to another PC or lost its binding', () => {
    for (const reason of REASONS_WITH_A_LICENCE_FOR_ANOTHER_PROOF) {
      expect(planStartupForLicence(status('unlicensed', reason), installedWithExplorerAsShell)).toEqual({ startShell: true, openSignIn: true })
    }
  })

  it('starts the shell with a licence whether or not Alpine is the Windows shell yet', () => {
    for (const context of [installedWithExplorerAsShell, installedWithAlpineAsShell]) {
      expect(planStartupForLicence(status('valid'), context)).toEqual({ startShell: true, openSignIn: false })
    }
  })

  it('never holds a run from source at setup, and still opens the sign-in when licensing is enforced there', () => {
    for (const reason of ALL_UNLICENSED_REASONS) {
      expect(planStartupForLicence(status('unlicensed', reason), runningFromSource)).toEqual({ startShell: true, openSignIn: true })
    }
    expect(planStartupForLicence(status('development'), runningFromSource)).toEqual({ startShell: true, openSignIn: false })
  })

  it('reads the Windows shell only when the licence leaves the decision to it', () => {
    let shellReads = 0
    const countingContext = {
      packaged: true,
      get shellRegisteredToAlpine() {
        shellReads += 1
        return false
      },
    }
    planStartupForLicence(status('valid'), countingContext)
    planStartupForLicence(status('unlicensed', 'binding-mismatch'), countingContext)
    expect(shellReads).toBe(0)
    planStartupForLicence(status('unlicensed', 'missing'), countingContext)
    expect(shellReads).toBe(1)
  })

  it('opens the sign-in window only when there is no verifiable licence on this PC and the shell starts', () => {
    expect(planStartupForLicence(status('valid'), installedWithAlpineAsShell).openSignIn).toBe(false)
    expect(planStartupForLicence(status('development'), installedWithAlpineAsShell).openSignIn).toBe(false)
    expect(planStartupForLicence(null, installedWithAlpineAsShell).openSignIn).toBe(false)
    expect(planStartupForLicence(status('unlicensed', 'missing'), installedWithExplorerAsShell).openSignIn).toBe(false)
  })
})

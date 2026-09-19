import { describe, expect, it } from 'vitest'

const { planStartupForLicence } = await import('./licenceStartup.js')

function status(state, reason = null) {
  return { state, reason }
}

describe('the startup plan for a licence', () => {
  it('starts the shell whatever the licence says, so a licence check can never take the desktop away', () => {
    for (const state of ['development', 'valid', 'unlicensed']) {
      expect(planStartupForLicence(status(state)).startShell).toBe(true)
    }
    expect(planStartupForLicence(null).startShell).toBe(true)
  })

  it('opens the sign-in window only when there is no verifiable licence on this PC', () => {
    for (const reason of ['missing', 'unreadable', 'unverifiable', 'device-mismatch', 'binding-mismatch']) {
      expect(planStartupForLicence(status('unlicensed', reason)).openSignIn).toBe(true)
    }
    expect(planStartupForLicence(status('valid')).openSignIn).toBe(false)
    expect(planStartupForLicence(status('development')).openSignIn).toBe(false)
    expect(planStartupForLicence(null).openSignIn).toBe(false)
  })
})

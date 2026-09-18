import { describe, expect, it, vi } from 'vitest'

const { evaluateLicenceState, UNLICENSED_REASONS } = await import('./licenceState.js')

const DEVICE_ID = 'a'.repeat(64)
const OTHER_DEVICE_ID = 'b'.repeat(64)
const BIND_HASH = 'c'.repeat(43)
const BIND_CLAIM = { tier: 'tpm', hash: BIND_HASH }
const RELEASE = { isReleaseBuild: true, enforceInDevelopment: false }
const DEVELOPMENT = { isReleaseBuild: false, enforceInDevelopment: false }
const ENFORCED_DEVELOPMENT = { isReleaseBuild: false, enforceInDevelopment: true }

function claimsFor(dev = DEVICE_ID, extra = {}) {
  return { sub: 'user', lic: 'lic', act: 'act', dev, iat: 1, ...extra }
}

function evaluate(overrides = {}) {
  return evaluateLicenceState({ claims: claimsFor(), deviceId: DEVICE_ID, licenceFile: 'present', config: RELEASE, proveBinding: () => true, ...overrides })
}

describe('a release build', () => {
  it('is valid with a verified token bound to this device, and stays valid forever because nothing expires', () => {
    expect(evaluate()).toEqual({ state: 'valid', reason: null })
  })

  it('is unlicensed when the licence file is missing', () => {
    expect(evaluate({ claims: null, licenceFile: 'missing' })).toEqual({ state: 'unlicensed', reason: 'missing' })
  })

  it('is unlicensed when the licence file cannot be read as a record', () => {
    expect(evaluate({ claims: null, licenceFile: 'unreadable' })).toEqual({ state: 'unlicensed', reason: 'unreadable' })
  })

  it('is unlicensed when the token in the file does not verify', () => {
    expect(evaluate({ claims: null })).toEqual({ state: 'unlicensed', reason: 'unverifiable' })
  })

  it('is unlicensed when the token was minted for another PC', () => {
    expect(evaluate({ claims: claimsFor(OTHER_DEVICE_ID) })).toEqual({ state: 'unlicensed', reason: 'device-mismatch' })
  })

  it('trusts the signature when this PC cannot read its own identity', () => {
    expect(evaluate({ deviceId: null })).toEqual({ state: 'valid', reason: null })
  })

  it('is valid when the bind claim is reproduced on this PC', () => {
    const proveBinding = vi.fn(() => true)
    expect(evaluate({ claims: claimsFor(DEVICE_ID, { bind: BIND_CLAIM }), proveBinding })).toEqual({ state: 'valid', reason: null })
    expect(proveBinding).toHaveBeenCalledWith(BIND_CLAIM)
  })

  it('is unlicensed, not lapsed, when the bind claim cannot be reproduced on this PC', () => {
    expect(evaluate({ claims: claimsFor(DEVICE_ID, { bind: BIND_CLAIM }), proveBinding: () => false })).toEqual({ state: 'unlicensed', reason: 'binding-mismatch' })
    expect(evaluate({ claims: claimsFor(DEVICE_ID, { bind: BIND_CLAIM }), proveBinding: undefined })).toEqual({ state: 'unlicensed', reason: 'binding-mismatch' })
  })

  it('keeps a token with no bind claim valid without asking for a proof', () => {
    const proveBinding = vi.fn(() => false)
    expect(evaluate({ proveBinding })).toEqual({ state: 'valid', reason: null })
    expect(evaluate({ claims: claimsFor(DEVICE_ID, { bind: null }), proveBinding })).toEqual({ state: 'valid', reason: null })
    expect(proveBinding).not.toHaveBeenCalled()
  })

  it('asks for the proof only once the signature and the device id have passed', () => {
    const proveBinding = vi.fn(() => true)
    expect(evaluate({ claims: claimsFor(OTHER_DEVICE_ID, { bind: BIND_CLAIM }), proveBinding }).reason).toBe('device-mismatch')
    expect(proveBinding).not.toHaveBeenCalled()
  })

  it('only ever reports the documented unlicensed reasons', () => {
    const reasons = [
      evaluate({ claims: null, licenceFile: 'missing' }).reason,
      evaluate({ claims: null, licenceFile: 'unreadable' }).reason,
      evaluate({ claims: null }).reason,
      evaluate({ claims: claimsFor(OTHER_DEVICE_ID) }).reason,
      evaluate({ claims: claimsFor(DEVICE_ID, { bind: BIND_CLAIM }), proveBinding: () => false }).reason,
    ]
    expect(reasons).toEqual(UNLICENSED_REASONS)
  })
})

describe('a development build', () => {
  it('is development whatever is on disk', () => {
    expect(evaluate({ config: DEVELOPMENT })).toEqual({ state: 'development', reason: null })
    expect(evaluate({ config: DEVELOPMENT, claims: null, licenceFile: 'missing' })).toEqual({ state: 'development', reason: null })
  })

  it('enforces like a release build when asked to', () => {
    expect(evaluate({ config: ENFORCED_DEVELOPMENT })).toEqual({ state: 'valid', reason: null })
    expect(evaluate({ config: ENFORCED_DEVELOPMENT, claims: null, licenceFile: 'missing' })).toEqual({ state: 'unlicensed', reason: 'missing' })
  })
})

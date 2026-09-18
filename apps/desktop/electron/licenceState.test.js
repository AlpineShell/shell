import { describe, expect, it } from 'vitest'

const {
  evaluateLicenceState,
  computeEffectiveNow,
  EXPIRED_GRACE_MS,
  REVOKED_GRACE_MS,
  CLOCK_ROLLBACK_ALLOWANCE_MS,
  DAY_MS,
  HOUR_MS,
} = await import('./licenceState.js')

const NOW = Date.UTC(2026, 8, 18, 12, 0, 0)
const DEVICE_ID = 'a'.repeat(64)
const OTHER_DEVICE_ID = 'b'.repeat(64)
const RELEASE = { isReleaseBuild: true, enforceInDevelopment: false, upgradeGraceUntil: null }
const DEVELOPMENT = { isReleaseBuild: false, enforceInDevelopment: false, upgradeGraceUntil: null }

function claimsExpiringAt(expiresAtMs, dev = DEVICE_ID) {
  return { sub: 'user', lic: 'lic', act: 'act', dev, iat: Math.floor((expiresAtMs - 30 * DAY_MS) / 1000), exp: Math.floor(expiresAtMs / 1000) }
}

function file(overrides = {}) {
  return { present: true, revokedAt: null, revokedReason: null, lastServerTime: null, highWaterMark: null, ...overrides }
}

function installed(overrides = {}) {
  return { setupComplete: true, shellRegisteredToAlpine: () => true, ...overrides }
}

function fresh() {
  return { setupComplete: false, shellRegisteredToAlpine: () => false }
}

function evaluate(overrides = {}) {
  return evaluateLicenceState({ claims: null, deviceId: DEVICE_ID, file: null, now: NOW, config: RELEASE, install: fresh(), ...overrides })
}

describe('effective time', () => {
  it('is the wall clock when nothing else is known', () => {
    expect(computeEffectiveNow({ now: NOW, lastServerTime: null, highWaterMark: null })).toBe(NOW)
  })

  it('never runs behind the last server time', () => {
    expect(computeEffectiveNow({ now: NOW - 5 * DAY_MS, lastServerTime: NOW, highWaterMark: null })).toBe(NOW)
    expect(computeEffectiveNow({ now: NOW - 5 * DAY_MS, lastServerTime: new Date(NOW).toISOString(), highWaterMark: null })).toBe(NOW)
  })

  it('allows a day of clock drift below the high-water mark and no more', () => {
    expect(computeEffectiveNow({ now: NOW - 30 * DAY_MS, lastServerTime: null, highWaterMark: NOW })).toBe(NOW - CLOCK_ROLLBACK_ALLOWANCE_MS)
    expect(computeEffectiveNow({ now: NOW - HOUR_MS, lastServerTime: null, highWaterMark: NOW })).toBe(NOW - HOUR_MS)
  })

  it('moves forward with the wall clock', () => {
    expect(computeEffectiveNow({ now: NOW + DAY_MS, lastServerTime: NOW, highWaterMark: NOW })).toBe(NOW + DAY_MS)
  })

  it('ignores unparseable timestamps', () => {
    expect(computeEffectiveNow({ now: NOW, lastServerTime: 'never', highWaterMark: {} })).toBe(NOW)
  })

  it('ignores a high-water mark poisoned far past the last server time so a corrected clock recovers', () => {
    const serverTime = NOW - 5 * DAY_MS
    const poisoned = NOW + 90 * DAY_MS
    expect(computeEffectiveNow({ now: NOW, lastServerTime: serverTime, highWaterMark: poisoned })).toBe(NOW)
    const stillTrusted = NOW + 10 * DAY_MS
    expect(computeEffectiveNow({ now: NOW - 2 * DAY_MS, lastServerTime: serverTime, highWaterMark: stillTrusted })).toBe(stillTrusted - CLOCK_ROLLBACK_ALLOWANCE_MS)
  })
})

describe('development builds', () => {
  it('report development and never enforce without the opt-in', () => {
    expect(evaluate({ config: DEVELOPMENT, install: installed() })).toMatchObject({ state: 'development', reason: null })
  })

  it('enforce like a release when ALPINE_ENFORCE_LICENCE is set', () => {
    const config = { ...DEVELOPMENT, enforceInDevelopment: true }
    expect(evaluate({ config, install: installed() }).state).toBe('lapsed')
    expect(evaluate({ config, claims: claimsExpiringAt(NOW + DAY_MS), file: file() }).state).toBe('valid')
  })
})

describe('a verified token for this device', () => {
  it('is valid until it expires', () => {
    const result = evaluate({ claims: claimsExpiringAt(NOW + 10 * DAY_MS), file: file() })
    expect(result).toMatchObject({ state: 'valid', reason: null, until: null })
    expect(result.expiresAt).toBe(NOW + 10 * DAY_MS)
  })

  it('is grace for 14 days after it expires', () => {
    const expiresAt = NOW - 3 * DAY_MS
    expect(evaluate({ claims: claimsExpiringAt(expiresAt), file: file() })).toMatchObject({
      state: 'grace',
      reason: 'expired',
      until: expiresAt + EXPIRED_GRACE_MS,
    })
  })

  it('is lapsed once the 14 days are over', () => {
    expect(evaluate({ claims: claimsExpiringAt(NOW - EXPIRED_GRACE_MS - 1), file: file() }).state).toBe('lapsed')
    expect(evaluate({ claims: claimsExpiringAt(NOW - EXPIRED_GRACE_MS), file: file() }).state).toBe('lapsed')
  })

  it('cannot be revived by rolling the clock back', () => {
    const expiresAt = NOW - 20 * DAY_MS
    const rolledBack = NOW - 25 * DAY_MS
    const withMarks = file({ highWaterMark: NOW, lastServerTime: NOW - 2 * DAY_MS })
    expect(evaluate({ claims: claimsExpiringAt(expiresAt), file: withMarks, now: rolledBack }).state).toBe('lapsed')
    expect(evaluate({ claims: claimsExpiringAt(expiresAt), file: file(), now: rolledBack }).state).toBe('valid')
  })

  it('treats a token still inside the drift allowance as the server would', () => {
    const expiresAt = NOW - 10 * DAY_MS
    const rolledBack = NOW - 30 * DAY_MS
    expect(evaluate({ claims: claimsExpiringAt(expiresAt), file: file({ lastServerTime: NOW - 5 * DAY_MS }), now: rolledBack })).toMatchObject({ state: 'grace', reason: 'expired' })
  })
})

describe('a verified token when the device id cannot be read', () => {
  it('is grace, bounded by the same exp plus 14 days', () => {
    const expiresAt = NOW + 10 * DAY_MS
    expect(evaluate({ claims: claimsExpiringAt(expiresAt), deviceId: null, file: file() })).toMatchObject({
      state: 'grace',
      reason: 'device-unreadable',
      until: expiresAt + EXPIRED_GRACE_MS,
    })
    expect(evaluate({ claims: claimsExpiringAt(NOW - 2 * DAY_MS), deviceId: null, file: file() })).toMatchObject({ state: 'grace', reason: 'device-unreadable' })
  })

  it('is lapsed once that bound passes', () => {
    expect(evaluate({ claims: claimsExpiringAt(NOW - EXPIRED_GRACE_MS - 1), deviceId: null, file: file() }).state).toBe('lapsed')
  })
})

describe('a verified token whose activation secret cannot be read', () => {
  it('is short grace so a copied file cannot run indefinitely without the secret', () => {
    const result = evaluate({ claims: claimsExpiringAt(NOW + 20 * DAY_MS), file: file(), secretStatus: 'unreadable', secretUnreadableSince: NOW - HOUR_MS })
    expect(result).toMatchObject({ state: 'grace', reason: 'secret-unreadable', until: NOW - HOUR_MS + REVOKED_GRACE_MS })
  })

  it('lapses once the secret grace passes even with a token signed valid', () => {
    expect(evaluate({ claims: claimsExpiringAt(NOW + 20 * DAY_MS), file: file(), secretStatus: 'unreadable', secretUnreadableSince: NOW - 73 * HOUR_MS }).state).toBe('lapsed')
  })

  it('is unaffected when the secret reads back normally', () => {
    expect(evaluate({ claims: claimsExpiringAt(NOW + 20 * DAY_MS), file: file(), secretStatus: 'ok' }).state).toBe('valid')
  })
})

describe('a verified token for another device', () => {
  it('is never valid here', () => {
    expect(evaluate({ claims: claimsExpiringAt(NOW + 10 * DAY_MS, OTHER_DEVICE_ID), file: file(), install: installed() }).state).toBe('lapsed')
  })

  it('leaves a fresh machine unlicensed so the installer asks for a sign-in', () => {
    expect(evaluate({ claims: claimsExpiringAt(NOW + 10 * DAY_MS, OTHER_DEVICE_ID), file: file(), install: fresh() }).state).toBe('unlicensed')
  })
})

describe('server revocations', () => {
  it.each(['refunded', 'disputed', 'moved', 'released', 'conflict', 'account-deleted', 'invalid'])('give 72 hours of grace with reason %s', (reason) => {
    const revokedAt = NOW - HOUR_MS
    const result = evaluate({ claims: claimsExpiringAt(NOW + 10 * DAY_MS), file: file({ revokedAt, revokedReason: reason }) })
    expect(result).toMatchObject({ state: 'grace', reason, until: revokedAt + REVOKED_GRACE_MS })
  })

  it('outrank a token that is still signed valid', () => {
    const revokedAt = NOW - 71 * HOUR_MS
    expect(evaluate({ claims: claimsExpiringAt(NOW + 20 * DAY_MS), file: file({ revokedAt, revokedReason: 'moved' }) })).toMatchObject({ state: 'grace', reason: 'moved' })
  })

  it('lapse after 72 hours even with a signed token and even inside the upgrade window', () => {
    const revokedAt = NOW - REVOKED_GRACE_MS
    const config = { ...RELEASE, upgradeGraceUntil: NOW + 10 * DAY_MS }
    expect(evaluate({ claims: claimsExpiringAt(NOW + 20 * DAY_MS), file: file({ revokedAt, revokedReason: 'refunded' }), install: installed(), config }).state).toBe('lapsed')
  })

  it('map an unknown reason to invalid', () => {
    expect(evaluate({ file: file({ revokedAt: NOW - HOUR_MS, revokedReason: 'something-new' }) })).toMatchObject({ state: 'grace', reason: 'invalid' })
  })

  it('accept ISO timestamps', () => {
    const revokedAt = new Date(NOW - HOUR_MS).toISOString()
    expect(evaluate({ file: file({ revokedAt, revokedReason: 'released' }) })).toMatchObject({ state: 'grace', reason: 'released', until: NOW - HOUR_MS + REVOKED_GRACE_MS })
  })

  it('do not honour a revocation dated in the future', () => {
    expect(evaluate({ claims: claimsExpiringAt(NOW + 20 * DAY_MS), file: file({ revokedAt: NOW + 2 * DAY_MS, revokedReason: 'moved' }) }).state).toBe('lapsed')
    expect(evaluate({ claims: claimsExpiringAt(NOW + 20 * DAY_MS), file: file({ revokedAt: NOW + 30 * 60 * 1000, revokedReason: 'moved' }) }).state).toBe('grace')
  })

  it('cannot be stretched by rolling the clock back', () => {
    const revokedAt = NOW - REVOKED_GRACE_MS - CLOCK_ROLLBACK_ALLOWANCE_MS
    const withMarks = file({ revokedAt, revokedReason: 'conflict', highWaterMark: NOW })
    expect(evaluate({ file: withMarks, now: NOW - 3 * DAY_MS }).state).toBe('lapsed')
    expect(evaluate({ file: file({ revokedAt, revokedReason: 'conflict' }), now: NOW - 3 * DAY_MS }).state).toBe('grace')
  })
})

describe('no verifiable token', () => {
  it('is unlicensed on a fresh machine with no file', () => {
    expect(evaluate({ file: null, install: fresh() })).toMatchObject({ state: 'unlicensed', reason: null, until: null })
  })

  it('is lapsed on an installed machine whose file is missing', () => {
    expect(evaluate({ file: null, install: installed() }).state).toBe('lapsed')
  })

  it('is lapsed when .setup-complete is missing but the shell is registered by hand', () => {
    expect(evaluate({ file: null, install: { setupComplete: false, shellRegisteredToAlpine: () => true } }).state).toBe('lapsed')
  })

  it('is lapsed when the file exists but its token does not verify', () => {
    expect(evaluate({ claims: null, file: file(), install: installed() }).state).toBe('lapsed')
    expect(evaluate({ claims: null, file: file(), install: fresh() }).state).toBe('unlicensed')
  })

  it('does not consult the registry when .setup-complete already answers', () => {
    let asked = false
    evaluate({ file: null, install: { setupComplete: true, shellRegisteredToAlpine: () => { asked = true; return true } } })
    expect(asked).toBe(false)
  })
})

describe('the upgrade window', () => {
  const upgradeGraceUntil = NOW + 10 * DAY_MS
  const config = { ...RELEASE, upgradeGraceUntil }

  it('gives an installed machine without a token grace until the baked date', () => {
    expect(evaluate({ file: null, install: installed(), config })).toMatchObject({ state: 'grace', reason: 'upgrade', until: upgradeGraceUntil })
    expect(evaluate({ file: null, install: installed(), config: { ...config, upgradeGraceUntil: new Date(upgradeGraceUntil).toISOString() } })).toMatchObject({ state: 'grace', reason: 'upgrade', until: upgradeGraceUntil })
  })

  it('does nothing for a fresh machine', () => {
    expect(evaluate({ file: null, install: fresh(), config }).state).toBe('unlicensed')
  })

  it('does not grant grace to a machine that only has the marker file but is not the registered shell', () => {
    const markerOnly = { setupComplete: true, shellRegisteredToAlpine: () => false }
    expect(evaluate({ file: null, install: markerOnly, config }).state).toBe('lapsed')
  })

  it('closes on the baked date', () => {
    expect(evaluate({ file: null, install: installed(), config, now: upgradeGraceUntil }).state).toBe('lapsed')
    expect(evaluate({ file: null, install: installed(), config: { ...RELEASE, upgradeGraceUntil: NOW - 1 } }).state).toBe('lapsed')
  })

  it('cannot be reopened by rolling the clock back', () => {
    expect(evaluate({ file: file({ highWaterMark: upgradeGraceUntil + 2 * DAY_MS }), install: installed(), config, now: NOW }).state).toBe('lapsed')
  })

  it('does not extend a token that expired more than 14 days ago', () => {
    expect(evaluate({ claims: claimsExpiringAt(NOW - 20 * DAY_MS), file: file(), install: installed(), config }).state).toBe('lapsed')
  })

  it('ignores an unparseable date', () => {
    expect(evaluate({ file: null, install: installed(), config: { ...RELEASE, upgradeGraceUntil: 'someday' } }).state).toBe('lapsed')
  })
})

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const EXPIRED_GRACE_MS = 14 * DAY_MS
const REVOKED_GRACE_MS = 72 * HOUR_MS
const CLOCK_ROLLBACK_ALLOWANCE_MS = 24 * HOUR_MS
const REVOKED_AT_FUTURE_TOLERANCE_MS = HOUR_MS

const REVOCATION_REASONS = ['refunded', 'disputed', 'moved', 'released', 'conflict', 'account-deleted', 'invalid']

function toMs(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value) {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function computeEffectiveNow({ now, lastServerTime, highWaterMark }) {
  const serverFloor = toMs(lastServerTime) ?? 0
  const rollbackFloor = (toMs(highWaterMark) ?? 0) - CLOCK_ROLLBACK_ALLOWANCE_MS
  return Math.max(now, serverFloor, rollbackFloor)
}

function revocationReason(file) {
  return REVOCATION_REASONS.includes(file.revokedReason) ? file.revokedReason : 'invalid'
}

function decision(state, reason = null, until = null) {
  return { state, reason, until }
}

function decideFromRevocation(file, effectiveNow) {
  const revokedAt = toMs(file.revokedAt)
  if (revokedAt === null) return null
  if (revokedAt > effectiveNow + REVOKED_AT_FUTURE_TOLERANCE_MS) return decision('lapsed')
  const until = revokedAt + REVOKED_GRACE_MS
  if (effectiveNow < until) return decision('grace', revocationReason(file), until)
  return decision('lapsed')
}

function decideFromToken(claims, deviceId, effectiveNow) {
  const expiresAt = claims.exp * 1000
  const graceUntil = expiresAt + EXPIRED_GRACE_MS
  if (deviceId === null) {
    return effectiveNow < graceUntil ? decision('grace', 'device-unreadable', graceUntil) : decision('lapsed')
  }
  if (claims.dev !== deviceId) return null
  if (expiresAt > effectiveNow) return decision('valid')
  if (effectiveNow < graceUntil) return decision('grace', 'expired', graceUntil)
  return decision('lapsed')
}

function decideWithoutToken(install, config, effectiveNow) {
  const upgradeGraceUntil = toMs(config.upgradeGraceUntil)
  if (install.setupComplete && upgradeGraceUntil !== null && effectiveNow < upgradeGraceUntil) {
    return decision('grace', 'upgrade', upgradeGraceUntil)
  }
  if (!install.setupComplete && !install.shellRegisteredToAlpine()) return decision('unlicensed')
  return decision('lapsed')
}

function evaluateLicenceState({ claims, deviceId, file, now, config, install }) {
  const effectiveNow = computeEffectiveNow({
    now,
    lastServerTime: file ? file.lastServerTime : null,
    highWaterMark: file ? file.highWaterMark : null,
  })
  const enforced = config.isReleaseBuild === true || config.enforceInDevelopment === true
  const outcome = !enforced
    ? decision('development')
    : (file && decideFromRevocation(file, effectiveNow))
      || (claims && decideFromToken(claims, deviceId, effectiveNow))
      || decideWithoutToken(install, config, effectiveNow)
  return {
    ...outcome,
    effectiveNow,
    expiresAt: claims && Number.isFinite(claims.exp) ? claims.exp * 1000 : null,
  }
}

module.exports = {
  HOUR_MS,
  DAY_MS,
  EXPIRED_GRACE_MS,
  REVOKED_GRACE_MS,
  CLOCK_ROLLBACK_ALLOWANCE_MS,
  REVOKED_AT_FUTURE_TOLERANCE_MS,
  REVOCATION_REASONS,
  toMs,
  computeEffectiveNow,
  evaluateLicenceState,
}

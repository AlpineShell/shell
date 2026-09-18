const path = require('path')
const fs = require('fs')
const { loadLicenceConfig, DEVICE_CLIENT_ID } = require('../licenceConfig')
const { verifyLicenceToken, tokenExpiryMs, tokenIssuedAtMs } = require('../licenceToken')
const { evaluateLicenceState, toMs } = require('../licenceState')
const deviceIdentity = require('../deviceIdentity')
const { regQuery } = require('../registryRead')
const { guardHandlers } = require('../trustedSenders')

const LICENCE_FILE_NAME = 'licence.json'
const SETUP_COMPLETE_FILE_NAME = '.setup-complete'
const WINLOGON_KEY = 'HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon'
const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
const BOOT_EVALUATION_DELAY_MS = 20 * 1000
const PERIODIC_EVALUATION_MS = 6 * HOUR_MS
const REFRESH_AFTER_MS = 24 * HOUR_MS
const REFRESH_WHEN_REMAINING_MS = 7 * DAY_MS
const HIGH_WATER_MARK_WRITE_STEP_MS = MINUTE_MS
const WRITE_RETRY_DELAY_MS = 30 * 1000
const REVOKED_RECHECK_AFTER_MS = 12 * HOUR_MS
const TRANSIENT_RETRY_DELAYS_MS = [MINUTE_MS, 5 * MINUTE_MS, 30 * MINUTE_MS, 6 * HOUR_MS]
const DEVICE_CODE_DEFAULT_INTERVAL_S = 5
const DEVICE_CODE_SLOW_DOWN_S = 5
const DEVICE_CODE_DEFAULT_EXPIRES_S = 600
const DEVICE_CODE_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code'
const NO_LICENCE_RECHECK_MS = 10 * 1000
const NO_LICENCE_RECHECK_WINDOW_MS = 20 * MINUTE_MS
const REQUEST_TIMEOUT_MS = 15 * 1000
const RELEASE_TIMEOUT_MS = 3 * 1000
const STATES_THAT_MAY_RUN = new Set(['development', 'valid', 'grace'])
const CHANNELS_ANY_WINDOW_MAY_INVOKE = ['licence/online']

const REVOCATION_REASON_BY_ERROR = {
  'licence-revoked': 'refunded',
  'licence-disputed': 'disputed',
  'activation-moved': 'moved',
  'activation-released': 'released',
  'activation-conflict': 'conflict',
  'account-deleted': 'account-deleted',
  'licence-mode-mismatch': 'invalid',
  'device-mismatch': 'invalid',
  'activation-invalid': 'invalid',
}

function isoOrNull(ms) {
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null
}

function parseJson(text) {
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function unrefTimer(timer) {
  if (timer && typeof timer.unref === 'function') timer.unref()
  return timer
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function idleProgress() {
  return { phase: 'idle', userCode: null, verificationUri: null, outcome: null, error: null }
}

function seatFromServer(entry) {
  return {
    id: typeof entry.id === 'string' ? entry.id : '',
    licenceId: typeof entry.licenceId === 'string' ? entry.licenceId : '',
    deviceName: typeof entry.deviceName === 'string' ? entry.deviceName : '',
    lastSeenAt: typeof entry.lastSeenAt === 'string' ? entry.lastSeenAt : null,
  }
}

function defaultDependencies() {
  return {
    config: null,
    fileSystem: fs,
    userDataDirectory: () => require('electron').app.getPath('userData'),
    appVersion: () => require('electron').app.getVersion(),
    openExternal: (url) => require('electron').shell.openExternal(url),
    encryptSecret: (secret) => {
      const { safeStorage } = require('electron')
      if (!safeStorage.isEncryptionAvailable()) return null
      return safeStorage.encryptString(secret).toString('base64')
    },
    decryptSecret: (encrypted) => require('electron').safeStorage.decryptString(Buffer.from(encrypted, 'base64')),
    fetch: (url, init) => globalThis.fetch(url, init),
    now: () => Date.now(),
    readDeviceId: () => deviceIdentity.readDeviceId(),
    readDeviceName: () => deviceIdentity.readDeviceName(),
    isShellRegisteredToAlpine: () => {
      const currentShell = regQuery(WINLOGON_KEY, 'Shell')
      return currentShell !== null && !currentShell.toLowerCase().includes('explorer.exe')
    },
    onPowerResume: (listener) => {
      try {
        require('electron').powerMonitor.on('resume', listener)
      } catch {
        void 0
      }
    },
    log: (message) => console.error(`[licence] ${message}`),
  }
}

function createLicenceService(overrides = {}) {
  const deps = { ...defaultDependencies(), ...overrides }
  const config = deps.config || loadLicenceConfig()

  let broadcast = null
  let cachedDeviceId = null
  let licenceWindowOpener = null
  const statusListeners = new Set()
  let signInFlow = null
  let progress = idleProgress()
  let lastReportedKey = null
  let bootTimer = null
  let periodicTimer = null
  let retryTimer = null
  let transientFailures = 0
  let evaluationInFlight = null

  function licenceFilePath() {
    return path.join(deps.userDataDirectory(), LICENCE_FILE_NAME)
  }

  function setupCompletePath() {
    return path.join(deps.userDataDirectory(), SETUP_COMPLETE_FILE_NAME)
  }

  function readRecord() {
    try {
      const parsed = JSON.parse(deps.fileSystem.readFileSync(licenceFilePath(), 'utf8'))
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
    } catch {
      return null
    }
  }

  function writeRecord(record) {
    try {
      const file = licenceFilePath()
      deps.fileSystem.mkdirSync(path.dirname(file), { recursive: true })
      const tempFile = `${file}.tmp`
      deps.fileSystem.writeFileSync(tempFile, JSON.stringify(record, null, 2))
      deps.fileSystem.renameSync(tempFile, file)
      return true
    } catch (error) {
      deps.log(`could not write ${LICENCE_FILE_NAME}: ${error.message}`)
      return false
    }
  }

  function deleteRecord() {
    try {
      deps.fileSystem.unlinkSync(licenceFilePath())
    } catch {
      void 0
    }
  }

  function isSetupComplete() {
    try {
      return deps.fileSystem.existsSync(setupCompletePath())
    } catch {
      return false
    }
  }

  function deviceId() {
    if (cachedDeviceId === null) cachedDeviceId = deps.readDeviceId()
    return cachedDeviceId
  }

  function verifiedClaims(token) {
    if (typeof token !== 'string' || !token) return null
    const result = verifyLicenceToken(token, { publicKeys: config.publicKeys, issuer: config.authBase })
    return result.ok ? result.claims : null
  }

  function fileFacts(record) {
    return {
      present: true,
      revokedAt: record.revokedAt ?? null,
      revokedReason: record.revokedReason ?? null,
      lastServerTime: record.lastServerTime ?? null,
      highWaterMark: record.highWaterMark ?? null,
    }
  }

  function secretStatusOf(record) {
    if (typeof record.activationSecretEncrypted !== 'string' || !record.activationSecretEncrypted) return 'absent'
    try {
      const secret = deps.decryptSecret(record.activationSecretEncrypted)
      return typeof secret === 'string' && secret ? 'ok' : 'unreadable'
    } catch {
      return 'unreadable'
    }
  }

  function persistEvaluationMarks(record, now, secretStatus) {
    if (!record) return
    const patch = {}
    const current = toMs(record.highWaterMark) ?? 0
    if (now - current >= HIGH_WATER_MARK_WRITE_STEP_MS) patch.highWaterMark = isoOrNull(now)
    if (secretStatus === 'unreadable' && !record.secretUnreadableSince) patch.secretUnreadableSince = isoOrNull(now)
    if (secretStatus !== 'unreadable' && record.secretUnreadableSince) patch.secretUnreadableSince = null
    if (Object.keys(patch).length === 0) return
    writeRecord({ ...record, ...patch })
  }

  function buildStatus(record, claims, decision, currentDeviceId) {
    return {
      state: decision.state,
      reason: decision.reason,
      graceUntil: isoOrNull(decision.until),
      email: (record && typeof record.email === 'string' ? record.email : null) ?? (claims && typeof claims.email === 'string' ? claims.email : null),
      licenceId: (record && typeof record.licenceId === 'string' ? record.licenceId : null) ?? (claims ? claims.lic : null),
      activationId: record && typeof record.activationId === 'string' ? record.activationId : null,
      deviceName: record && typeof record.deviceName === 'string' ? record.deviceName : null,
      expiresAt: isoOrNull(decision.expiresAt),
      lastRefreshAt: record && typeof record.lastRefreshAt === 'string' ? record.lastRefreshAt : null,
      movedTo: record && typeof record.movedTo === 'string' ? record.movedTo : null,
      deviceReadable: currentDeviceId !== null,
      releaseBuild: config.isReleaseBuild === true,
    }
  }

  function evaluateFromDisk() {
    const record = readRecord()
    const now = deps.now()
    const currentDeviceId = deviceId()
    const claims = record ? verifiedClaims(record.token) : null
    const secretStatus = record && claims ? secretStatusOf(record) : 'ok'
    const secretUnreadableSince = secretStatus === 'unreadable' ? (record.secretUnreadableSince ?? isoOrNull(now)) : null
    const decision = evaluateLicenceState({
      claims,
      deviceId: currentDeviceId,
      file: record ? fileFacts(record) : null,
      now,
      config,
      install: { setupComplete: isSetupComplete(), shellRegisteredToAlpine: () => deps.isShellRegisteredToAlpine() },
      secretStatus,
      secretUnreadableSince,
    })
    persistEvaluationMarks(record, now, secretStatus)
    return { record, claims, decision, status: buildStatus(record, claims, decision, currentDeviceId) }
  }

  function statusKey(status) {
    return [status.state, status.reason, status.graceUntil, status.expiresAt, status.email, status.lastRefreshAt, status.movedTo].join('|')
  }

  function reportStatus(status, force) {
    const key = statusKey(status)
    if (!force && key === lastReportedKey) return
    lastReportedKey = key
    if (broadcast) broadcast('licence/changed', status)
    for (const listener of statusListeners) {
      try {
        listener(status)
      } catch (error) {
        deps.log(`status listener failed: ${error.message}`)
      }
    }
  }

  function onStatusChanged(listener) {
    if (typeof listener !== 'function') return () => undefined
    statusListeners.add(listener)
    return () => statusListeners.delete(listener)
  }

  function setProgress(patch) {
    progress = { ...progress, ...patch }
    if (broadcast) broadcast('licence/sign-in-progress', progress)
    return progress
  }

  async function postJson(url, body, { authorization = null, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
    const controller = new AbortController()
    const abortTimer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const headers = { 'Content-Type': 'application/json', Accept: 'application/json' }
      if (authorization) headers.Authorization = authorization
      const response = await deps.fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal })
      const text = await response.text()
      return { status: response.status, body: parseJson(text), error: null }
    } catch (error) {
      return { status: 0, body: null, error: error && error.message ? error.message : 'network' }
    } finally {
      clearTimeout(abortTimer)
    }
  }

  function activationSecret(record) {
    if (typeof record.activationSecretEncrypted !== 'string' || !record.activationSecretEncrypted) return null
    try {
      const secret = deps.decryptSecret(record.activationSecretEncrypted)
      return typeof secret === 'string' && secret ? secret : null
    } catch {
      return null
    }
  }

  function encryptedSecretOrNull(secret) {
    try {
      const encrypted = deps.encryptSecret(secret)
      if (!encrypted) deps.log('secret storage unavailable; this activation cannot refresh')
      return encrypted || null
    } catch (error) {
      deps.log(`secret storage failed: ${error.message}`)
      return null
    }
  }

  function clearRetryTimer() {
    if (retryTimer) clearTimeout(retryTimer)
    retryTimer = null
  }

  function scheduleTransientRetry(cause) {
    const delay = TRANSIENT_RETRY_DELAYS_MS[Math.min(transientFailures, TRANSIENT_RETRY_DELAYS_MS.length - 1)]
    transientFailures += 1
    clearRetryTimer()
    retryTimer = unrefTimer(setTimeout(() => {
      retryTimer = null
      refreshIfDue({ force: true }).catch((error) => deps.log(`retry failed: ${error.message}`))
    }, delay))
    deps.log(`refresh failed (${cause}); retrying in ${Math.round(delay / 1000)} s`)
    return `transient:${cause}`
  }

  function refreshDue(record, claims, now) {
    const lastRefresh = toMs(record.lastRefreshAt)
    if (lastRefresh === null || now - lastRefresh >= REFRESH_AFTER_MS) return true
    const expiry = tokenExpiryMs(claims)
    return expiry === null || expiry - now < REFRESH_WHEN_REMAINING_MS
  }

  function scheduleWriteRetry() {
    clearRetryTimer()
    retryTimer = unrefTimer(setTimeout(() => {
      retryTimer = null
      refreshIfDue({ force: true }).catch((error) => deps.log(`write retry failed: ${error.message}`))
    }, WRITE_RETRY_DELAY_MS))
    deps.log('could not persist the refreshed licence; retrying before the replay window closes')
    return 'write-failed'
  }

  function applyRefreshedToken(record, body, now) {
    const claims = verifiedClaims(body.token)
    if (!claims) return scheduleTransientRetry('unverifiable-token')
    const serverTime = Math.max(toMs(body.serverTime) ?? 0, tokenIssuedAtMs(claims) ?? 0, toMs(record.lastServerTime) ?? 0)
    const written = writeRecord({
      ...record,
      token: body.token,
      activationSecretEncrypted: encryptedSecretOrNull(body.activationSecret),
      lastRefreshAt: isoOrNull(now),
      lastServerTime: isoOrNull(serverTime),
      highWaterMark: isoOrNull(now),
      revokedAt: null,
      revokedReason: null,
      movedTo: null,
      secretUnreadableSince: null,
    })
    if (!written) return scheduleWriteRetry()
    transientFailures = 0
    clearRetryTimer()
    reportStatus(evaluateFromDisk().status, true)
    return 'refreshed'
  }

  function applyRevocation(record, error, body, now) {
    writeRecord({
      ...record,
      revokedAt: record.revokedAt ?? isoOrNull(now),
      revokedReason: REVOCATION_REASON_BY_ERROR[error],
      movedTo: typeof body.movedTo === 'string' ? body.movedTo : null,
      highWaterMark: isoOrNull(now),
    })
    transientFailures = 0
    clearRetryTimer()
    reportStatus(evaluateFromDisk().status, true)
    return `revoked:${REVOCATION_REASON_BY_ERROR[error]}`
  }

  function applyRefreshResponse(record, response) {
    const now = deps.now()
    const body = response.body || {}
    const hasNewToken = typeof body.token === 'string' && typeof body.activationSecret === 'string'
    if (response.status === 200 && hasNewToken) return applyRefreshedToken(record, body, now)
    const error = typeof body.error === 'string' ? body.error : null
    const enumerated = error !== null && Object.prototype.hasOwnProperty.call(REVOCATION_REASON_BY_ERROR, error)
    const revokedResponse = enumerated && (response.status === 403 || (response.status === 401 && error === 'activation-invalid'))
    if (revokedResponse) return applyRevocation(record, error, body, now)
    return scheduleTransientRetry(response.status ? `http-${response.status}` : response.error)
  }

  async function refreshIfDue({ force = false } = {}) {
    const record = readRecord()
    if (!record || typeof record.token !== 'string' || typeof record.activationId !== 'string') return 'nothing-to-refresh'
    let effectiveForce = force
    if (record.revokedAt) {
      const revokedMs = toMs(record.revokedAt)
      const dueForRecheck = force || (revokedMs !== null && deps.now() - revokedMs >= REVOKED_RECHECK_AFTER_MS)
      if (!dueForRecheck) return 'revoked'
      effectiveForce = true
    }
    const claims = verifiedClaims(record.token)
    if (!effectiveForce && !refreshDue(record, claims, deps.now())) return 'not-due'
    const secret = activationSecret(record)
    if (!secret) {
      deps.log('activation secret unavailable; refresh skipped')
      return 'no-secret'
    }
    const id = deviceId()
    if (!id) return 'device-unreadable'
    const response = await postJson(`${config.authBase}/licences/refresh`, { deviceId: id, appVersion: deps.appVersion() }, {
      authorization: `Activation ${record.activationId}.${secret}`,
    })
    return applyRefreshResponse(record, response)
  }

  function persistActivation(body) {
    const now = deps.now()
    const claims = verifiedClaims(body.token)
    const serverTime = Math.max(tokenIssuedAtMs(claims) ?? 0, now)
    writeRecord({
      token: body.token,
      activationId: body.activationId,
      activationSecretEncrypted: encryptedSecretOrNull(body.activationSecret),
      email: body.account && typeof body.account.email === 'string' ? body.account.email : null,
      licenceId: body.licence && typeof body.licence.id === 'string' ? body.licence.id : null,
      deviceName: deps.readDeviceName(),
      lastRefreshAt: isoOrNull(now),
      lastServerTime: isoOrNull(serverTime),
      highWaterMark: isoOrNull(now),
      revokedAt: null,
      revokedReason: null,
      movedTo: null,
    })
    transientFailures = 0
    clearRetryTimer()
  }

  function signOutSession(sessionToken) {
    postJson(`${config.authBase}/api/auth/sign-out`, {}, { authorization: `Bearer ${sessionToken}` }).catch(() => null)
  }

  function classifyActivation(response) {
    const body = response.body || {}
    if (response.status === 0) return { kind: 'unreachable' }
    if (response.status === 200) {
      const complete = typeof body.token === 'string' && typeof body.activationId === 'string' && typeof body.activationSecret === 'string'
      if (!complete) return { kind: 'error', message: 'activate-incomplete' }
      if (!verifiedClaims(body.token)) return { kind: 'error', message: 'token-unverifiable' }
      return {
        kind: 'activated',
        email: body.account && typeof body.account.email === 'string' ? body.account.email : null,
        licenceId: body.licence && typeof body.licence.id === 'string' ? body.licence.id : null,
      }
    }
    if (response.status === 402) return { kind: 'no-licence', email: typeof body.email === 'string' ? body.email : null }
    if (response.status === 409 && body.error === 'seats-in-use') {
      return { kind: 'seats-in-use', activations: Array.isArray(body.activations) ? body.activations.filter(Boolean).map(seatFromServer) : [] }
    }
    if (response.status === 429 && body.error === 'move-limit') return { kind: 'move-limit', retryAt: typeof body.retryAt === 'string' ? body.retryAt : null }
    if (response.status === 403 && body.error === 'licence-mode-mismatch') return { kind: 'mode-mismatch' }
    if (response.status === 403 && body.error === 'replacement-not-yours') return { kind: 'replacement-not-yours' }
    if (response.status === 401) return { kind: 'session-expired' }
    return { kind: 'error', message: typeof body.error === 'string' ? body.error : `activate-${response.status}` }
  }

  function scheduleNoLicenceRecheck(flow) {
    if (flow.cancelled || !flow.sessionToken) return
    if (flow.recheckDeadline === null) flow.recheckDeadline = deps.now() + NO_LICENCE_RECHECK_WINDOW_MS
    if (deps.now() >= flow.recheckDeadline) return
    if (flow.recheckTimer) clearTimeout(flow.recheckTimer)
    flow.recheckTimer = unrefTimer(setTimeout(() => {
      flow.recheckTimer = null
      recheckNoLicence(flow).catch((error) => deps.log(`licence re-check failed: ${error.message}`))
    }, NO_LICENCE_RECHECK_MS))
  }

  async function recheckNoLicence(flow) {
    if (flow.cancelled || signInFlow !== flow) return
    const outcome = await activateWithFlow(flow, {})
    if (flow.cancelled) return
    if (outcome.kind !== 'no-licence') setProgress({ phase: 'done', outcome })
  }

  async function activateWithFlow(flow, options) {
    const id = deviceId()
    if (!id) return { kind: 'device-unreadable' }
    const payload = { deviceId: id, deviceName: deps.readDeviceName(), appVersion: deps.appVersion() }
    if (typeof options.replaceActivationId === 'string' && options.replaceActivationId) payload.replaceActivationId = options.replaceActivationId
    const response = await postJson(`${config.authBase}/licences/activate`, payload, { authorization: `Bearer ${flow.sessionToken}` })
    if (flow.cancelled) return { kind: 'error', message: 'cancelled' }
    const outcome = classifyActivation(response)
    if (outcome.kind === 'activated') {
      persistActivation(response.body)
      signOutSession(flow.sessionToken)
      flow.sessionToken = null
      if (signInFlow === flow) signInFlow = null
      reportStatus(evaluateFromDisk().status, true)
    } else if (outcome.kind === 'no-licence') {
      scheduleNoLicenceRecheck(flow)
    } else if (outcome.kind === 'session-expired') {
      flow.sessionToken = null
    }
    return outcome
  }

  async function pollDeviceToken(flow, code) {
    const intervalSeconds = Number.isFinite(code.interval) && code.interval > 0 ? code.interval : DEVICE_CODE_DEFAULT_INTERVAL_S
    const expiresSeconds = Number.isFinite(code.expires_in) && code.expires_in > 0 ? code.expires_in : DEVICE_CODE_DEFAULT_EXPIRES_S
    const deadline = deps.now() + expiresSeconds * 1000
    let intervalMs = intervalSeconds * 1000
    while (!flow.cancelled) {
      await sleep(intervalMs)
      if (flow.cancelled) return { outcome: 'cancelled' }
      if (deps.now() > deadline) return { outcome: 'expired' }
      const response = await postJson(`${config.authBase}/api/auth/device/token`, {
        grant_type: DEVICE_CODE_GRANT_TYPE,
        device_code: code.device_code,
        client_id: DEVICE_CLIENT_ID,
      })
      const body = response.body || {}
      if (response.status === 200 && typeof body.access_token === 'string') return { outcome: 'granted', accessToken: body.access_token }
      if (body.error === 'authorization_pending' || response.status === 0) continue
      if (body.error === 'slow_down') {
        intervalMs += DEVICE_CODE_SLOW_DOWN_S * 1000
        continue
      }
      if (body.error === 'access_denied') return { outcome: 'denied' }
      if (body.error === 'expired_token') return { outcome: 'expired' }
      return { outcome: 'error', error: typeof body.error === 'string' ? body.error : `token-${response.status}` }
    }
    return { outcome: 'cancelled' }
  }

  async function runDeviceFlow(flow) {
    const code = await postJson(`${config.authBase}/api/auth/device/code`, { client_id: DEVICE_CLIENT_ID, scope: 'licence' })
    if (flow.cancelled) return
    if (code.status !== 200 || !code.body || typeof code.body.device_code !== 'string') {
      setProgress({ phase: 'error', error: code.status === 0 ? 'unreachable' : `device-code-${code.status}` })
      return
    }
    const verificationUri = code.body.verification_uri_complete || code.body.verification_uri || null
    if (verificationUri) {
      try {
        await deps.openExternal(verificationUri)
      } catch (error) {
        deps.log(`could not open the browser: ${error.message}`)
      }
    }
    setProgress({ phase: 'waiting', userCode: typeof code.body.user_code === 'string' ? code.body.user_code : null, verificationUri })
    const grant = await pollDeviceToken(flow, code.body)
    if (flow.cancelled) return
    if (grant.outcome !== 'granted') {
      setProgress({ phase: grant.outcome, error: grant.error ?? null })
      return
    }
    flow.sessionToken = grant.accessToken
    setProgress({ phase: 'activating' })
    const outcome = await activateWithFlow(flow, {})
    if (!flow.cancelled) setProgress({ phase: 'done', outcome })
  }

  function cancelSignIn() {
    if (signInFlow) {
      signInFlow.cancelled = true
      if (signInFlow.recheckTimer) clearTimeout(signInFlow.recheckTimer)
      signInFlow = null
    }
    progress = idleProgress()
    return setProgress({})
  }

  async function startSignIn() {
    cancelSignIn()
    const flow = { cancelled: false, sessionToken: null, recheckTimer: null, recheckDeadline: null }
    signInFlow = flow
    setProgress({ phase: 'starting' })
    try {
      await runDeviceFlow(flow)
    } catch (error) {
      if (!flow.cancelled) setProgress({ phase: 'error', error: error.message })
    }
    return progress
  }

  async function activate(options) {
    const flow = signInFlow
    if (!flow || !flow.sessionToken) return { kind: 'session-expired' }
    if (flow.recheckTimer) clearTimeout(flow.recheckTimer)
    flow.recheckTimer = null
    setProgress({ phase: 'activating' })
    const outcome = await activateWithFlow(flow, options && typeof options === 'object' ? options : {})
    if (!flow.cancelled) setProgress({ phase: 'done', outcome })
    return outcome
  }

  async function releaseSelf() {
    const record = readRecord()
    if (!record || typeof record.activationId !== 'string') return false
    const secret = activationSecret(record)
    if (!secret) return false
    const response = await postJson(`${config.authBase}/licences/release-self`, {}, {
      authorization: `Activation ${record.activationId}.${secret}`,
      timeoutMs: RELEASE_TIMEOUT_MS,
    })
    return response.status === 200
  }

  async function release() {
    await releaseSelf()
    deleteRecord()
    clearRetryTimer()
    transientFailures = 0
    const status = evaluateFromDisk().status
    reportStatus(status, true)
    return status
  }

  async function refreshNow() {
    await refreshIfDue({ force: true })
    const status = evaluateFromDisk().status
    reportStatus(status, false)
    return status
  }

  function runEvaluation() {
    if (evaluationInFlight) return evaluationInFlight
    evaluationInFlight = (async () => {
      try {
        reportStatus(evaluateFromDisk().status, false)
        await refreshIfDue()
      } catch (error) {
        deps.log(`evaluation failed: ${error.message}`)
      } finally {
        evaluationInFlight = null
      }
    })()
    return evaluationInFlight
  }

  function stop() {
    if (bootTimer) clearTimeout(bootTimer)
    if (periodicTimer) clearInterval(periodicTimer)
    bootTimer = null
    periodicTimer = null
    clearRetryTimer()
  }

  function start(broadcastFn) {
    broadcast = typeof broadcastFn === 'function' ? broadcastFn : null
    stop()
    bootTimer = unrefTimer(setTimeout(() => {
      bootTimer = null
      runEvaluation()
    }, BOOT_EVALUATION_DELAY_MS))
    periodicTimer = unrefTimer(setInterval(() => runEvaluation(), PERIODIC_EVALUATION_MS))
    deps.onPowerResume(() => runEvaluation())
  }

  function status() {
    return evaluateFromDisk().status
  }

  function evaluateAtStartup() {
    const current = evaluateFromDisk().status
    lastReportedKey = statusKey(current)
    return current
  }

  function requireValid() {
    const current = evaluateFromDisk().status
    if (!STATES_THAT_MAY_RUN.has(current.state)) {
      const error = new Error('licence-required')
      error.code = 'licence-required'
      error.licence = current
      throw error
    }
    return current
  }

  function currentToken() {
    const { record, status: current } = evaluateFromDisk()
    return current.state === 'valid' && record && typeof record.token === 'string' ? record.token : null
  }

  function setLicenceWindowOpener(opener) {
    licenceWindowOpener = typeof opener === 'function' ? opener : null
  }

  function openLicenceWindow() {
    if (!licenceWindowOpener) return false
    licenceWindowOpener()
    return true
  }

  const handlers = {
    'licence/status': () => status(),
    'licence/sign-in': () => {
      startSignIn().catch((error) => deps.log(`sign-in failed: ${error.message}`))
      return progress
    },
    'licence/sign-in-state': () => progress,
    'licence/cancel-sign-in': () => cancelSignIn(),
    'licence/activate': (_event, options) => activate(options),
    'licence/open-checkout': async () => {
      await deps.openExternal(`${config.websiteBase}/checkout?from=installer`)
    },
    'licence/open-account': async () => {
      await deps.openExternal(`${config.websiteBase}/account`)
    },
    'licence/release': () => release(),
    'licence/refresh-now': () => refreshNow(),
    'licence/online': () => {
      runEvaluation()
    },
  }

  return {
    handlers,
    start,
    stop,
    status,
    evaluateAtStartup,
    requireValid,
    currentToken,
    releaseSelf,
    refreshNow,
    runEvaluation,
    setLicenceWindowOpener,
    openLicenceWindow,
    onStatusChanged,
    config,
  }
}

function guardedHandlers(handlers) {
  return guardHandlers(handlers, { except: CHANNELS_ANY_WINDOW_MAY_INVOKE })
}

const defaultService = createLicenceService()

module.exports = {
  ...defaultService,
  handlers: guardedHandlers(defaultService.handlers),
  createLicenceService,
  guardedHandlers,
  LICENCE_FILE_NAME,
  BOOT_EVALUATION_DELAY_MS,
  PERIODIC_EVALUATION_MS,
  TRANSIENT_RETRY_DELAYS_MS,
  WRITE_RETRY_DELAY_MS,
  REVOKED_RECHECK_AFTER_MS,
  NO_LICENCE_RECHECK_MS,
  REVOCATION_REASON_BY_ERROR,
}

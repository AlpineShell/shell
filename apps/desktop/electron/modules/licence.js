const path = require('path')
const fs = require('fs')
const { loadLicenceConfig, DEVICE_CLIENT_ID } = require('../licenceConfig')
const { verifyLicenceToken } = require('../licenceToken')
const { evaluateLicenceState } = require('../licenceState')
const { isBindClaim, isBindingTier } = require('../licenceBinding')
const { createLicenceBindingLadder } = require('../licenceBindingProviders')
const deviceIdentity = require('../deviceIdentity')
const { guardHandlers, SETUP_WINDOW } = require('../trustedSenders')

const LICENCE_FILE_NAME = 'licence.json'
const MINUTE_MS = 60 * 1000
const DEVICE_CODE_DEFAULT_INTERVAL_S = 5
const DEVICE_CODE_SLOW_DOWN_S = 5
const DEVICE_CODE_DEFAULT_EXPIRES_S = 600
const DEVICE_CODE_RETRY_AFTER_MAX_MS = 30 * 1000
const DEVICE_CODE_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code'
const NO_LICENCE_RECHECK_MS = 10 * 1000
const NO_LICENCE_RECHECK_WINDOW_MS = 20 * MINUTE_MS
const REQUEST_TIMEOUT_MS = 15 * 1000
const RELEASE_TIMEOUT_MS = 3 * 1000
const STATES_THAT_MAY_RUN = new Set(['development', 'valid'])

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

function stringOrNull(value) {
  return typeof value === 'string' ? value : null
}

function isTransientFailure(status) {
  return status === 429 || (status >= 500 && status <= 599)
}

function retryAfterHeader(headers) {
  if (!headers || typeof headers.get !== 'function') return null
  return headers.get('x-retry-after') ?? headers.get('retry-after')
}

function retryAfterMs(headers, now) {
  const value = retryAfterHeader(headers)
  if (!value) return null
  const trimmed = value.trim()
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000
  const retryAt = Date.parse(trimmed)
  return Number.isFinite(retryAt) ? Math.max(0, retryAt - now) : null
}

function isWebsiteDevicePage(websiteBase, value) {
  let page
  let devicePage
  try {
    page = new URL(value)
    devicePage = new URL(`${websiteBase}/device`)
  } catch {
    return false
  }
  return page.origin === devicePage.origin && page.pathname.replace(/\/+$/, '') === devicePage.pathname
}

function deviceVerificationUrl(websiteBase, body) {
  const offered = stringOrNull(body.verification_uri_complete) || stringOrNull(body.verification_uri)
  if (offered && isWebsiteDevicePage(websiteBase, offered)) return offered
  const userCode = stringOrNull(body.user_code)
  return userCode ? `${websiteBase}/device?user_code=${encodeURIComponent(userCode)}` : `${websiteBase}/device`
}

function seatFromServer(entry) {
  return {
    id: stringOrNull(entry.id) ?? '',
    licenceId: stringOrNull(entry.licenceId) ?? '',
    deviceName: stringOrNull(entry.deviceName) ?? '',
    activatedAt: stringOrNull(entry.activatedAt),
  }
}

function defaultDependencies() {
  return {
    config: null,
    fileSystem: fs,
    userDataDirectory: () => require('electron').app.getPath('userData'),
    appVersion: () => require('electron').app.getVersion(),
    openExternal: (url) => require('electron').shell.openExternal(url),
    fetch: (url, init) => globalThis.fetch(url, init),
    now: () => Date.now(),
    readDeviceId: () => deviceIdentity.readDeviceId(),
    readDeviceName: () => deviceIdentity.readDeviceName(),
    binding: null,
    log: (message) => console.error(`[licence] ${message}`),
  }
}

function bindTierOf(record, claims) {
  if (record && isBindingTier(record.bindTier)) return record.bindTier
  return claims && isBindClaim(claims.bind) ? claims.bind.tier : null
}

function createLicenceService(overrides = {}) {
  const deps = { ...defaultDependencies(), ...overrides }
  const config = deps.config || loadLicenceConfig()
  const binding = deps.binding || createLicenceBindingLadder({ userDataDirectory: deps.userDataDirectory, fileSystem: deps.fileSystem, log: deps.log })

  let broadcast = null
  let cachedDeviceId = null
  const statusListeners = new Set()
  let signInFlow = null
  let progress = idleProgress()

  function licenceFilePath() {
    return path.join(deps.userDataDirectory(), LICENCE_FILE_NAME)
  }

  function readLicenceFile() {
    let text
    try {
      text = deps.fileSystem.readFileSync(licenceFilePath(), 'utf8')
    } catch {
      return { file: 'missing', record: null }
    }
    const parsed = parseJson(text)
    if (!parsed || Array.isArray(parsed)) return { file: 'unreadable', record: null }
    return { file: 'present', record: parsed }
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

  function deviceId() {
    if (cachedDeviceId === null) cachedDeviceId = deps.readDeviceId()
    return cachedDeviceId
  }

  function verifiedClaims(token) {
    if (typeof token !== 'string' || !token) return null
    const result = verifyLicenceToken(token, { publicKeys: config.publicKeys, issuer: config.authBase, now: deps.now() })
    return result.ok ? result.claims : null
  }

  function buildStatus(record, claims, decision, currentDeviceId) {
    return {
      state: decision.state,
      reason: decision.reason,
      email: (record && stringOrNull(record.email)) ?? (claims && stringOrNull(claims.email)) ?? null,
      licenceId: (record && stringOrNull(record.licenceId)) ?? (claims ? claims.lic : null),
      activationId: record ? stringOrNull(record.activationId) : null,
      deviceName: record ? stringOrNull(record.deviceName) : null,
      activatedAt: record ? stringOrNull(record.activatedAt) : null,
      bindTier: bindTierOf(record, claims),
      deviceReadable: currentDeviceId !== null,
      releaseBuild: config.isReleaseBuild === true,
    }
  }

  function proveBinding(claim) {
    return binding.verify(claim)
  }

  function evaluateFromDisk() {
    const { file, record } = readLicenceFile()
    const currentDeviceId = deviceId()
    const claims = record ? verifiedClaims(record.token) : null
    const decision = evaluateLicenceState({ claims, deviceId: currentDeviceId, licenceFile: file, config, proveBinding })
    return { record, claims, decision, status: buildStatus(record, claims, decision, currentDeviceId) }
  }

  function reportStatus(status) {
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
      return { status: response.status, body: parseJson(text), headers: response.headers, error: null }
    } catch (error) {
      return { status: 0, body: null, headers: null, error: error && error.message ? error.message : 'network' }
    } finally {
      clearTimeout(abortTimer)
    }
  }

  function chosenDeviceName(options) {
    const chosen = options && typeof options.deviceName === 'string' ? options.deviceName.trim() : ''
    return chosen ? deviceIdentity.capDeviceName(chosen) : deps.readDeviceName()
  }

  function persistActivation(body, deviceName) {
    const claims = verifiedClaims(body.token)
    writeRecord({
      token: body.token,
      activationId: body.activationId,
      email: body.account ? stringOrNull(body.account.email) : null,
      licenceId: body.licence ? stringOrNull(body.licence.id) : null,
      deviceName,
      activatedAt: isoOrNull(deps.now()),
      bindTier: bindTierOf(null, claims),
    })
    binding.forget()
  }

  function tokenBindingHolds(claims) {
    return claims.bind === undefined || claims.bind === null || proveBinding(claims.bind)
  }

  function signOutSession(sessionToken) {
    postJson(`${config.authBase}/api/auth/sign-out`, {}, { authorization: `Bearer ${sessionToken}` }).catch(() => null)
  }

  function classifyActivation(response) {
    const body = response.body || {}
    if (response.status === 0) return { kind: 'unreachable' }
    if (response.status === 200) {
      const complete = typeof body.token === 'string' && typeof body.activationId === 'string'
      if (!complete) return { kind: 'error', message: 'activate-incomplete' }
      const claims = verifiedClaims(body.token)
      if (!claims) return { kind: 'error', message: 'token-unverifiable' }
      if (!tokenBindingHolds(claims)) return { kind: 'error', message: 'binding-unverifiable' }
      return {
        kind: 'activated',
        email: body.account ? stringOrNull(body.account.email) : null,
        licenceId: body.licence ? stringOrNull(body.licence.id) : null,
      }
    }
    if (response.status === 402) return { kind: 'no-licence', email: stringOrNull(body.email) }
    if (response.status === 409 && body.error === 'seats-in-use') {
      return { kind: 'seats-in-use', activations: Array.isArray(body.activations) ? body.activations.filter(Boolean).map(seatFromServer) : [] }
    }
    if (response.status === 429 && body.error === 'move-limit') return { kind: 'move-limit', retryAt: stringOrNull(body.retryAt) }
    if (response.status === 403 && body.error === 'licence-mode-mismatch') return { kind: 'mode-mismatch' }
    if (response.status === 403 && body.error === 'replacement-not-yours') return { kind: 'replacement-not-yours' }
    if (response.status === 401) return { kind: 'session-expired' }
    return { kind: 'error', message: stringOrNull(body.error) ?? `activate-${response.status}` }
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
    if (flow.bind === undefined) flow.bind = binding.produce()
    const payload = { deviceId: id, deviceName: flow.deviceName, appVersion: deps.appVersion() }
    if (flow.bind) payload.binding = { tier: flow.bind.tier, hash: flow.bind.hash }
    if (typeof options.replaceActivationId === 'string' && options.replaceActivationId) payload.replaceActivationId = options.replaceActivationId
    const response = await postJson(`${config.authBase}/licences/activate`, payload, { authorization: `Bearer ${flow.sessionToken}` })
    if (flow.cancelled) return { kind: 'error', message: 'cancelled' }
    const outcome = classifyActivation(response)
    if (outcome.kind === 'activated') {
      persistActivation(response.body, flow.deviceName)
      signOutSession(flow.sessionToken)
      flow.sessionToken = null
      if (signInFlow === flow) signInFlow = null
      reportStatus(evaluateFromDisk().status)
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
    let retryWaitMs = 0
    while (!flow.cancelled) {
      await sleep(Math.max(intervalMs, retryWaitMs))
      retryWaitMs = 0
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
      if (isTransientFailure(response.status)) {
        retryWaitMs = Math.min(retryAfterMs(response.headers, deps.now()) ?? 0, DEVICE_CODE_RETRY_AFTER_MAX_MS)
        continue
      }
      if (body.error === 'access_denied') return { outcome: 'denied' }
      if (body.error === 'expired_token') return { outcome: 'expired' }
      return { outcome: 'error', error: stringOrNull(body.error) ?? `token-${response.status}` }
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
    const verificationUri = deviceVerificationUrl(config.websiteBase, code.body)
    try {
      await deps.openExternal(verificationUri)
    } catch (error) {
      deps.log(`could not open the browser: ${error.message}`)
    }
    setProgress({ phase: 'waiting', userCode: stringOrNull(code.body.user_code), verificationUri })
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

  async function startSignIn(options) {
    cancelSignIn()
    const flow = { cancelled: false, sessionToken: null, recheckTimer: null, recheckDeadline: null, deviceName: chosenDeviceName(options), bind: undefined }
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
    const token = currentToken()
    if (!token) return false
    const response = await postJson(`${config.authBase}/licences/release-self`, {}, {
      authorization: `Bearer ${token}`,
      timeoutMs: RELEASE_TIMEOUT_MS,
    })
    return response.status === 200
  }

  async function release() {
    await releaseSelf()
    deleteRecord()
    binding.discard()
    const status = evaluateFromDisk().status
    reportStatus(status)
    return status
  }

  function start(broadcastFn) {
    broadcast = typeof broadcastFn === 'function' ? broadcastFn : null
  }

  function status() {
    return evaluateFromDisk().status
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

  const handlers = {
    'licence/status': () => status(),
    'licence/sign-in': (_event, options) => {
      startSignIn(options).catch((error) => deps.log(`sign-in failed: ${error.message}`))
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
  }

  return {
    handlers,
    start,
    status,
    requireValid,
    currentToken,
    releaseSelf,
    onStatusChanged,
    config,
  }
}

const defaultService = createLicenceService()

module.exports = {
  ...defaultService,
  handlers: guardHandlers(defaultService.handlers, [SETUP_WINDOW]),
  createLicenceService,
  LICENCE_FILE_NAME,
  NO_LICENCE_RECHECK_MS,
}

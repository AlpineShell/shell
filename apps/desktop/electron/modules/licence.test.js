import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import crypto from 'crypto'
import path from 'path'

const {
  createLicenceService,
  BOOT_EVALUATION_DELAY_MS,
  PERIODIC_EVALUATION_MS,
  TRANSIENT_RETRY_DELAYS_MS,
  NO_LICENCE_RECHECK_MS,
} = await import('./licence.js')

const NOW = Date.UTC(2026, 8, 18, 12, 0, 0)
const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
const AUTH_BASE = 'https://auth.alpineshell.com'
const WEBSITE_BASE = 'https://alpineshell.com'
const DEVICE_ID = 'a'.repeat(64)
const USER_DATA = path.resolve(path.join(path.sep, 'alpine-test', 'userData'))
const LICENCE_PATH = path.join(USER_DATA, 'licence.json')
const SETUP_COMPLETE_PATH = path.join(USER_DATA, '.setup-complete')

function makeKeyPair(kid) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
  return { kid, privateKey, spkiPem: publicKey.export({ type: 'spki', format: 'pem' }).toString() }
}

const signingKey = makeKeyPair('lic-2026-09')
const publicKeys = [{ kid: signingKey.kid, spkiPem: signingKey.spkiPem }]

function base64url(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function mintToken(claimOverrides = {}) {
  const header = { alg: 'EdDSA', kid: signingKey.kid, typ: 'alpine-licence+jwt' }
  const claims = {
    iss: AUTH_BASE,
    aud: 'alpine-shell-desktop',
    sub: 'user_1',
    lic: 'lic_1',
    act: 'act_1',
    dev: DEVICE_ID,
    email: 'someone@example.com',
    jti: crypto.randomUUID(),
    iat: Math.floor(NOW / 1000) - 60,
    exp: Math.floor((NOW + 30 * DAY_MS) / 1000),
    ...claimOverrides,
  }
  const signingInput = `${base64url(header)}.${base64url(claims)}`
  const signature = crypto.sign(null, Buffer.from(signingInput), signingKey.privateKey)
  return `${signingInput}.${signature.toString('base64url')}`
}

function encrypt(secret) {
  return Buffer.from(`enc:${secret}`).toString('base64')
}

function decrypt(encrypted) {
  const text = Buffer.from(encrypted, 'base64').toString('utf8')
  if (!text.startsWith('enc:')) throw new Error('not encrypted by this test')
  return text.slice(4)
}

function memoryFileSystem(initialFiles = {}) {
  const files = new Map(Object.entries(initialFiles))
  return {
    files,
    existsSync: (file) => files.has(file),
    readFileSync: (file) => {
      if (!files.has(file)) throw new Error(`ENOENT ${file}`)
      return files.get(file)
    },
    writeFileSync: (file, data) => {
      files.set(file, String(data))
    },
    mkdirSync: () => undefined,
    unlinkSync: (file) => {
      files.delete(file)
    },
  }
}

function licenceRecord(overrides = {}) {
  return {
    token: mintToken(),
    activationId: 'act_1',
    activationSecretEncrypted: encrypt('secret-1'),
    email: 'someone@example.com',
    licenceId: 'lic_1',
    deviceName: 'TEST-PC',
    lastRefreshAt: new Date(NOW - 2 * DAY_MS).toISOString(),
    lastServerTime: new Date(NOW - 2 * DAY_MS).toISOString(),
    highWaterMark: new Date(NOW - 2 * DAY_MS).toISOString(),
    revokedAt: null,
    revokedReason: null,
    movedTo: null,
    ...overrides,
  }
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function routedFetch(routes) {
  const calls = []
  const fetch = vi.fn(async (url, init) => {
    const body = init && init.body ? JSON.parse(init.body) : null
    const call = { url, method: init?.method, headers: init?.headers ?? {}, body }
    calls.push(call)
    const route = routes.find((entry) => url.endsWith(entry.path))
    if (!route) throw new TypeError(`fetch failed: no route for ${url}`)
    const reply = typeof route.reply === 'function' ? route.reply(call) : route.reply
    if (reply instanceof Error) throw reply
    return reply
  })
  fetch.calls = calls
  return fetch
}

function makeService({ files = {}, fetch, config = {}, readDeviceId = () => DEVICE_ID } = {}) {
  const fileSystem = memoryFileSystem(files)
  const broadcasts = []
  const openExternal = vi.fn(async () => undefined)
  const service = createLicenceService({
    config: { isReleaseBuild: true, authBase: AUTH_BASE, websiteBase: WEBSITE_BASE, publicKeys, upgradeGraceUntil: null, enforceInDevelopment: false, ...config },
    fileSystem,
    userDataDirectory: () => USER_DATA,
    appVersion: () => '1.2.3',
    openExternal,
    encryptSecret: encrypt,
    decryptSecret: decrypt,
    fetch: fetch ?? routedFetch([]),
    readDeviceId,
    readDeviceName: () => 'TEST-PC',
    isShellRegisteredToAlpine: () => false,
    onPowerResume: () => undefined,
    log: () => undefined,
  })
  const broadcast = (channel, payload) => broadcasts.push({ channel, payload })
  const readRecord = () => (fileSystem.files.has(LICENCE_PATH) ? JSON.parse(fileSystem.files.get(LICENCE_PATH)) : null)
  const changed = () => broadcasts.filter((b) => b.channel === 'licence/changed').map((b) => b.payload)
  const progress = () => broadcasts.filter((b) => b.channel === 'licence/sign-in-progress').map((b) => b.payload)
  return { service, fileSystem, broadcasts, broadcast, readRecord, changed, progress, openExternal }
}

async function settle() {
  for (let i = 0; i < 10; i += 1) await new Promise((resolve) => setImmediate(resolve))
}

async function advance(ms) {
  await vi.advanceTimersByTimeAsync(ms)
  await settle()
}

let activeService = null

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  if (activeService) activeService.stop()
  activeService = null
  vi.useRealTimers()
})

describe('status from disk', () => {
  it('is unlicensed on a fresh machine and lapsed on an installed one', () => {
    const fresh = makeService()
    expect(fresh.service.status()).toMatchObject({ state: 'unlicensed', email: null, deviceReadable: true, releaseBuild: true })
    const installed = makeService({ files: { [SETUP_COMPLETE_PATH]: 'done' } })
    expect(installed.service.status().state).toBe('lapsed')
  })

  it('is valid with a signed token for this device and carries the record details', () => {
    const { service } = makeService({ files: { [LICENCE_PATH]: JSON.stringify(licenceRecord()) } })
    expect(service.status()).toMatchObject({
      state: 'valid',
      email: 'someone@example.com',
      licenceId: 'lic_1',
      activationId: 'act_1',
      deviceName: 'TEST-PC',
      expiresAt: new Date(NOW + 30 * DAY_MS).toISOString(),
    })
  })

  it('is lapsed when the file is corrupt on an installed machine', () => {
    const { service } = makeService({ files: { [LICENCE_PATH]: '{not json', [SETUP_COMPLETE_PATH]: 'done' } })
    expect(service.status().state).toBe('lapsed')
  })

  it('is development when the build is not a release', () => {
    const { service } = makeService({ config: { isReleaseBuild: false } })
    expect(service.status()).toMatchObject({ state: 'development', releaseBuild: false })
  })

  it('raises the high-water mark on evaluation so the clock cannot be rolled back', () => {
    const { service, readRecord } = makeService({ files: { [LICENCE_PATH]: JSON.stringify(licenceRecord()) } })
    service.status()
    expect(readRecord().highWaterMark).toBe(new Date(NOW).toISOString())
  })

  it('exposes the token only while valid', () => {
    const valid = makeService({ files: { [LICENCE_PATH]: JSON.stringify(licenceRecord()) } })
    expect(valid.service.currentToken()).toBe(valid.readRecord().token)
    const expired = makeService({ files: { [LICENCE_PATH]: JSON.stringify(licenceRecord({ token: mintToken({ exp: Math.floor((NOW - DAY_MS) / 1000) }) })) } })
    expect(expired.service.status()).toMatchObject({ state: 'grace', reason: 'expired' })
    expect(expired.service.currentToken()).toBeNull()
  })

  it('requireValid throws licence-required for lapsed and unlicensed but passes valid, grace and development', () => {
    expect(() => makeService().service.requireValid()).toThrow('licence-required')
    expect(() => makeService({ files: { [SETUP_COMPLETE_PATH]: 'done' } }).service.requireValid()).toThrow('licence-required')
    expect(makeService({ files: { [LICENCE_PATH]: JSON.stringify(licenceRecord()) } }).service.requireValid().state).toBe('valid')
    expect(makeService({ files: { [LICENCE_PATH]: JSON.stringify(licenceRecord({ token: mintToken({ exp: Math.floor((NOW - DAY_MS) / 1000) }) })) } }).service.requireValid().state).toBe('grace')
    expect(makeService({ config: { isReleaseBuild: false } }).service.requireValid().state).toBe('development')
  })

  it('reports device-unreadable grace when MachineGuid cannot be read', () => {
    const { service } = makeService({ files: { [LICENCE_PATH]: JSON.stringify(licenceRecord()) }, readDeviceId: () => null })
    expect(service.status()).toMatchObject({ state: 'grace', reason: 'device-unreadable', deviceReadable: false })
  })
})

describe('the refresh scheduler', () => {
  it('refreshes a token that is due and stores the rotated secret and server time', async () => {
    const newToken = mintToken({ exp: Math.floor((NOW + 30 * DAY_MS) / 1000), jti: 'fresh' })
    const serverTime = new Date(NOW + 5 * MINUTE_MS).toISOString()
    const fetch = routedFetch([
      { path: '/licences/refresh', reply: jsonResponse(200, { token: newToken, activationSecret: 'secret-2', expiresAt: new Date(NOW + 30 * DAY_MS).toISOString(), serverTime }) },
    ])
    const { service, readRecord, changed, broadcast } = makeService({ files: { [LICENCE_PATH]: JSON.stringify(licenceRecord()) }, fetch })
    activeService = service
    service.start(broadcast)
    expect(fetch).not.toHaveBeenCalled()

    await advance(BOOT_EVALUATION_DELAY_MS)

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.calls[0]).toMatchObject({
      url: `${AUTH_BASE}/licences/refresh`,
      method: 'POST',
      headers: { Authorization: 'Activation act_1.secret-1' },
      body: { deviceId: DEVICE_ID, appVersion: '1.2.3' },
    })
    const record = readRecord()
    expect(record.token).toBe(newToken)
    expect(decrypt(record.activationSecretEncrypted)).toBe('secret-2')
    expect(record.lastServerTime).toBe(serverTime)
    expect(record.lastRefreshAt).toBe(new Date(NOW + BOOT_EVALUATION_DELAY_MS).toISOString())
    expect(changed().at(-1)).toMatchObject({ state: 'valid', email: 'someone@example.com' })
  })

  it('does not call the server when the last refresh is recent and the token has time left', async () => {
    const fetch = routedFetch([{ path: '/licences/refresh', reply: jsonResponse(200, {}) }])
    const record = licenceRecord({ lastRefreshAt: new Date(NOW - HOUR_MS).toISOString() })
    const { service, broadcast } = makeService({ files: { [LICENCE_PATH]: JSON.stringify(record) }, fetch })
    activeService = service
    service.start(broadcast)
    await advance(BOOT_EVALUATION_DELAY_MS)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('refreshes when the token has under 7 days left even after a recent refresh', async () => {
    const fetch = routedFetch([{ path: '/licences/refresh', reply: jsonResponse(200, { token: mintToken(), activationSecret: 'secret-2', serverTime: new Date(NOW).toISOString() }) }])
    const record = licenceRecord({ lastRefreshAt: new Date(NOW - HOUR_MS).toISOString(), token: mintToken({ exp: Math.floor((NOW + 6 * DAY_MS) / 1000) }) })
    const { service, broadcast } = makeService({ files: { [LICENCE_PATH]: JSON.stringify(record) }, fetch })
    activeService = service
    service.start(broadcast)
    await advance(BOOT_EVALUATION_DELAY_MS)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('records an enumerated 403 as a revocation with 72 h of grace and stops refreshing', async () => {
    const fetch = routedFetch([{ path: '/licences/refresh', reply: jsonResponse(403, { error: 'activation-moved', movedTo: 'LAPTOP-2' }) }])
    const { service, readRecord, changed, broadcast } = makeService({ files: { [LICENCE_PATH]: JSON.stringify(licenceRecord()) }, fetch })
    activeService = service
    service.start(broadcast)
    await advance(BOOT_EVALUATION_DELAY_MS)

    const record = readRecord()
    expect(record.revokedAt).toBe(new Date(NOW + BOOT_EVALUATION_DELAY_MS).toISOString())
    expect(record.revokedReason).toBe('moved')
    expect(record.movedTo).toBe('LAPTOP-2')
    expect(record.token).toBeTruthy()
    expect(changed().at(-1)).toMatchObject({ state: 'grace', reason: 'moved', movedTo: 'LAPTOP-2', graceUntil: new Date(NOW + BOOT_EVALUATION_DELAY_MS + 72 * HOUR_MS).toISOString() })

    await advance(PERIODIC_EVALUATION_MS)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['licence-revoked', 403, 'refunded'],
    ['licence-disputed', 403, 'disputed'],
    ['activation-released', 403, 'released'],
    ['activation-conflict', 403, 'conflict'],
    ['account-deleted', 403, 'account-deleted'],
    ['licence-mode-mismatch', 403, 'invalid'],
    ['device-mismatch', 403, 'invalid'],
    ['activation-invalid', 401, 'invalid'],
  ])('maps %s (%i) to the %s grace reason', async (error, status, reason) => {
    const fetch = routedFetch([{ path: '/licences/refresh', reply: jsonResponse(status, { error }) }])
    const { service, readRecord, broadcast } = makeService({ files: { [LICENCE_PATH]: JSON.stringify(licenceRecord()) }, fetch })
    activeService = service
    service.start(broadcast)
    await advance(BOOT_EVALUATION_DELAY_MS)
    expect(readRecord().revokedReason).toBe(reason)
    expect(service.status()).toMatchObject({ state: 'grace', reason })
  })

  it('treats a 404 from a rolled-back deploy as transient and keeps the token', async () => {
    const fetch = routedFetch([{ path: '/licences/refresh', reply: jsonResponse(404, { message: 'not found' }) }])
    const original = licenceRecord()
    const { service, readRecord, broadcast } = makeService({ files: { [LICENCE_PATH]: JSON.stringify(original) }, fetch })
    activeService = service
    service.start(broadcast)

    await advance(BOOT_EVALUATION_DELAY_MS)
    expect(fetch).toHaveBeenCalledTimes(1)
    await advance(TRANSIENT_RETRY_DELAYS_MS[0] - 1)
    expect(fetch).toHaveBeenCalledTimes(1)
    await advance(1)
    expect(fetch).toHaveBeenCalledTimes(2)
    await advance(TRANSIENT_RETRY_DELAYS_MS[1])
    expect(fetch).toHaveBeenCalledTimes(3)
    await advance(TRANSIENT_RETRY_DELAYS_MS[2])
    expect(fetch).toHaveBeenCalledTimes(4)

    const record = readRecord()
    expect(record.token).toBe(original.token)
    expect(record.revokedAt).toBeNull()
    expect(decrypt(record.activationSecretEncrypted)).toBe('secret-1')
    expect(service.status().state).toBe('valid')
  })

  it('backs off after a network error and recovers on the next success', async () => {
    let attempts = 0
    const fetch = routedFetch([{
      path: '/licences/refresh',
      reply: () => {
        attempts += 1
        if (attempts < 3) return new TypeError('fetch failed')
        return jsonResponse(200, { token: mintToken({ jti: 'recovered' }), activationSecret: 'secret-3', serverTime: new Date(NOW + HOUR_MS).toISOString() })
      },
    }])
    const { service, readRecord, broadcast } = makeService({ files: { [LICENCE_PATH]: JSON.stringify(licenceRecord()) }, fetch })
    activeService = service
    service.start(broadcast)

    await advance(BOOT_EVALUATION_DELAY_MS)
    expect(fetch).toHaveBeenCalledTimes(1)
    await advance(TRANSIENT_RETRY_DELAYS_MS[0])
    expect(fetch).toHaveBeenCalledTimes(2)
    await advance(TRANSIENT_RETRY_DELAYS_MS[1])
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(decrypt(readRecord().activationSecretEncrypted)).toBe('secret-3')

    await advance(TRANSIENT_RETRY_DELAYS_MS[2])
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('treats a 429, a 5xx and a malformed body as transient', async () => {
    for (const reply of [jsonResponse(429, { error: 'slow' }), jsonResponse(500, {}), new Response('<html>', { status: 200 })]) {
      const fetch = routedFetch([{ path: '/licences/refresh', reply }])
      const original = licenceRecord()
      const { service, readRecord, broadcast } = makeService({ files: { [LICENCE_PATH]: JSON.stringify(original) }, fetch })
      service.start(broadcast)
      await advance(BOOT_EVALUATION_DELAY_MS)
      expect(readRecord().token).toBe(original.token)
      expect(readRecord().revokedAt).toBeNull()
      service.stop()
    }
  })

  it('keeps the old token when the server answers with a token this build cannot verify', async () => {
    const rogue = makeKeyPair('lic-2026-09')
    const header = { alg: 'EdDSA', kid: rogue.kid, typ: 'alpine-licence+jwt' }
    const claims = { iss: AUTH_BASE, aud: 'alpine-shell-desktop', sub: 'u', lic: 'l', act: 'a', dev: DEVICE_ID, jti: 'x', iat: 1, exp: Math.floor((NOW + 90 * DAY_MS) / 1000) }
    const signingInput = `${base64url(header)}.${base64url(claims)}`
    const rogueToken = `${signingInput}.${crypto.sign(null, Buffer.from(signingInput), rogue.privateKey).toString('base64url')}`
    const fetch = routedFetch([{ path: '/licences/refresh', reply: jsonResponse(200, { token: rogueToken, activationSecret: 'secret-x' }) }])
    const original = licenceRecord()
    const { service, readRecord, broadcast } = makeService({ files: { [LICENCE_PATH]: JSON.stringify(original) }, fetch })
    activeService = service
    service.start(broadcast)
    await advance(BOOT_EVALUATION_DELAY_MS)
    expect(readRecord().token).toBe(original.token)
    expect(decrypt(readRecord().activationSecretEncrypted)).toBe('secret-1')
  })

  it('skips the refresh when the secret cannot be decrypted instead of sending plaintext', async () => {
    const fetch = routedFetch([{ path: '/licences/refresh', reply: jsonResponse(200, {}) }])
    const record = licenceRecord({ activationSecretEncrypted: Buffer.from('plain-secret').toString('base64') })
    const { service, broadcast } = makeService({ files: { [LICENCE_PATH]: JSON.stringify(record) }, fetch })
    activeService = service
    service.start(broadcast)
    await advance(BOOT_EVALUATION_DELAY_MS)
    expect(fetch).not.toHaveBeenCalled()
    expect(service.status().state).toBe('valid')
  })

  it('runs again every six hours and on an online report', async () => {
    const fetch = routedFetch([{ path: '/licences/refresh', reply: () => jsonResponse(200, { token: mintToken(), activationSecret: 'secret-2', serverTime: new Date(Date.now()).toISOString() }) }])
    const { service, broadcast } = makeService({ files: { [LICENCE_PATH]: JSON.stringify(licenceRecord()) }, fetch })
    activeService = service
    service.start(broadcast)
    await advance(BOOT_EVALUATION_DELAY_MS)
    expect(fetch).toHaveBeenCalledTimes(1)
    await advance(PERIODIC_EVALUATION_MS)
    expect(fetch).toHaveBeenCalledTimes(1)
    await advance(4 * PERIODIC_EVALUATION_MS)
    expect(fetch).toHaveBeenCalledTimes(2)
    await advance(4 * PERIODIC_EVALUATION_MS)
    expect(fetch).toHaveBeenCalledTimes(3)
    await service.handlers['licence/online']()
    await settle()
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('refresh-now forces a refresh and returns the new status', async () => {
    const fetch = routedFetch([{ path: '/licences/refresh', reply: jsonResponse(200, { token: mintToken(), activationSecret: 'secret-2', serverTime: new Date(NOW).toISOString() }) }])
    const record = licenceRecord({ lastRefreshAt: new Date(NOW - HOUR_MS).toISOString() })
    const { service, readRecord } = makeService({ files: { [LICENCE_PATH]: JSON.stringify(record) }, fetch })
    const status = await service.handlers['licence/refresh-now']()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(status.state).toBe('valid')
    expect(decrypt(readRecord().activationSecretEncrypted)).toBe('secret-2')
  })
})

describe('the device flow sign-in', () => {
  const deviceCode = { device_code: 'dc_1', user_code: 'ABCD-EFGH', verification_uri: 'https://alpineshell.com/device', verification_uri_complete: 'https://alpineshell.com/device?user_code=ABCD-EFGH', interval: 5, expires_in: 600 }
  const activated = {
    token: mintToken({ jti: 'activated' }),
    activationId: 'act_9',
    activationSecret: 'secret-9',
    expiresAt: new Date(NOW + 7 * DAY_MS).toISOString(),
    licence: { id: 'lic_9' },
    account: { email: 'buyer@example.com' },
  }

  it('opens the browser, polls until approval, activates, signs out and writes the file', async () => {
    let tokenPolls = 0
    const fetch = routedFetch([
      { path: '/api/auth/device/code', reply: jsonResponse(200, deviceCode) },
      { path: '/api/auth/device/token', reply: () => { tokenPolls += 1; return tokenPolls < 3 ? jsonResponse(400, { error: 'authorization_pending' }) : jsonResponse(200, { access_token: 'sess_1', token_type: 'Bearer' }) } },
      { path: '/licences/activate', reply: jsonResponse(200, activated) },
      { path: '/api/auth/sign-out', reply: jsonResponse(200, { success: true }) },
    ])
    const { service, readRecord, changed, progress, openExternal, broadcast } = makeService({ fetch })
    activeService = service
    service.start(broadcast)

    const started = service.handlers['licence/sign-in']()
    expect(started.phase).toBe('starting')
    await settle()
    expect(openExternal).toHaveBeenCalledWith(deviceCode.verification_uri_complete)
    expect(service.handlers['licence/sign-in-state']()).toMatchObject({ phase: 'waiting', userCode: 'ABCD-EFGH', verificationUri: deviceCode.verification_uri_complete })

    await advance(5000)
    expect(tokenPolls).toBe(1)
    await advance(5000)
    expect(tokenPolls).toBe(2)
    await advance(5000)
    expect(tokenPolls).toBe(3)

    const tokenCall = fetch.calls.find((call) => call.url.endsWith('/api/auth/device/token'))
    expect(tokenCall.body).toEqual({ grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code: 'dc_1', client_id: 'alpine-shell-desktop' })
    const codeCall = fetch.calls.find((call) => call.url.endsWith('/api/auth/device/code'))
    expect(codeCall.body).toEqual({ client_id: 'alpine-shell-desktop', scope: 'licence' })

    const activateCall = fetch.calls.find((call) => call.url.endsWith('/licences/activate'))
    expect(activateCall.headers.Authorization).toBe('Bearer sess_1')
    expect(activateCall.body).toEqual({ deviceId: DEVICE_ID, deviceName: 'TEST-PC', appVersion: '1.2.3' })

    const signOut = fetch.calls.find((call) => call.url.endsWith('/api/auth/sign-out'))
    expect(signOut.headers.Authorization).toBe('Bearer sess_1')

    const record = readRecord()
    expect(record).toMatchObject({ token: activated.token, activationId: 'act_9', email: 'buyer@example.com', licenceId: 'lic_9', deviceName: 'TEST-PC', revokedAt: null })
    expect(decrypt(record.activationSecretEncrypted)).toBe('secret-9')
    expect(record.lastServerTime).toBe(new Date(NOW + 15000).toISOString())
    expect(JSON.stringify(record)).not.toContain('secret-9')
    expect(JSON.stringify(record)).not.toContain('sess_1')

    expect(progress().map((p) => p.phase)).toEqual(['idle', 'starting', 'waiting', 'activating', 'done'])
    expect(progress().at(-1).outcome).toEqual({ kind: 'activated', email: 'buyer@example.com', licenceId: 'lic_9' })
    expect(changed().at(-1)).toMatchObject({ state: 'valid', email: 'buyer@example.com' })
    expect(service.status().state).toBe('valid')
  })

  it('adds five seconds on slow_down and reports a denial', async () => {
    let tokenPolls = 0
    const fetch = routedFetch([
      { path: '/api/auth/device/code', reply: jsonResponse(200, deviceCode) },
      { path: '/api/auth/device/token', reply: () => { tokenPolls += 1; return tokenPolls === 1 ? jsonResponse(400, { error: 'slow_down' }) : jsonResponse(400, { error: 'access_denied' }) } },
    ])
    const { service, progress, broadcast } = makeService({ fetch })
    activeService = service
    service.start(broadcast)
    service.handlers['licence/sign-in']()
    await settle()
    await advance(5000)
    expect(tokenPolls).toBe(1)
    await advance(5000)
    expect(tokenPolls).toBe(1)
    await advance(5000)
    expect(tokenPolls).toBe(2)
    expect(progress().at(-1).phase).toBe('denied')
  })

  it('reports expiry when the server says the code expired', async () => {
    const fetch = routedFetch([
      { path: '/api/auth/device/code', reply: jsonResponse(200, deviceCode) },
      { path: '/api/auth/device/token', reply: jsonResponse(400, { error: 'expired_token' }) },
    ])
    const { service, progress, broadcast } = makeService({ fetch })
    activeService = service
    service.start(broadcast)
    service.handlers['licence/sign-in']()
    await settle()
    await advance(5000)
    expect(progress().at(-1).phase).toBe('expired')
  })

  it('stops polling when the sign-in is cancelled', async () => {
    let tokenPolls = 0
    const fetch = routedFetch([
      { path: '/api/auth/device/code', reply: jsonResponse(200, deviceCode) },
      { path: '/api/auth/device/token', reply: () => { tokenPolls += 1; return jsonResponse(400, { error: 'authorization_pending' }) } },
    ])
    const { service, broadcast } = makeService({ fetch })
    activeService = service
    service.start(broadcast)
    service.handlers['licence/sign-in']()
    await settle()
    await advance(5000)
    expect(tokenPolls).toBe(1)
    expect(service.handlers['licence/cancel-sign-in']().phase).toBe('idle')
    await advance(30000)
    expect(tokenPolls).toBe(1)
  })

  it('reports the auth service as unreachable without writing anything', async () => {
    const fetch = routedFetch([{ path: '/api/auth/device/code', reply: new TypeError('fetch failed') }])
    const { service, progress, readRecord, broadcast } = makeService({ fetch })
    activeService = service
    service.start(broadcast)
    service.handlers['licence/sign-in']()
    await settle()
    expect(progress().at(-1)).toMatchObject({ phase: 'error', error: 'unreachable' })
    expect(readRecord()).toBeNull()
  })

  it('keeps re-checking a 402 every 10 seconds until the purchase lands', async () => {
    let activations = 0
    const fetch = routedFetch([
      { path: '/api/auth/device/code', reply: jsonResponse(200, deviceCode) },
      { path: '/api/auth/device/token', reply: jsonResponse(200, { access_token: 'sess_2' }) },
      { path: '/licences/activate', reply: () => { activations += 1; return activations < 3 ? jsonResponse(402, { error: 'no-licence', email: 'buyer@example.com' }) : jsonResponse(200, activated) } },
      { path: '/api/auth/sign-out', reply: jsonResponse(200, {}) },
    ])
    const { service, progress, readRecord, broadcast } = makeService({ fetch })
    activeService = service
    service.start(broadcast)
    service.handlers['licence/sign-in']()
    await settle()
    await advance(5000)
    expect(activations).toBe(1)
    expect(progress().at(-1)).toMatchObject({ phase: 'done', outcome: { kind: 'no-licence', email: 'buyer@example.com' } })
    expect(readRecord()).toBeNull()

    await advance(NO_LICENCE_RECHECK_MS)
    expect(activations).toBe(2)
    await advance(NO_LICENCE_RECHECK_MS)
    expect(activations).toBe(3)
    expect(progress().at(-1)).toMatchObject({ phase: 'done', outcome: { kind: 'activated' } })
    expect(readRecord().activationId).toBe('act_9')

    await advance(10 * NO_LICENCE_RECHECK_MS)
    expect(activations).toBe(3)
  })

  it('lets the installer move a seat here with replaceActivationId', async () => {
    const seats = [{ id: 'act_old', licenceId: 'lic_9', deviceName: 'OLD-PC', lastSeenAt: new Date(NOW - DAY_MS).toISOString() }]
    let activations = 0
    const fetch = routedFetch([
      { path: '/api/auth/device/code', reply: jsonResponse(200, deviceCode) },
      { path: '/api/auth/device/token', reply: jsonResponse(200, { access_token: 'sess_3' }) },
      { path: '/licences/activate', reply: () => { activations += 1; return activations === 1 ? jsonResponse(409, { error: 'seats-in-use', activations: seats }) : jsonResponse(200, activated) } },
      { path: '/api/auth/sign-out', reply: jsonResponse(200, {}) },
    ])
    const { service, progress, broadcast } = makeService({ fetch })
    activeService = service
    service.start(broadcast)
    service.handlers['licence/sign-in']()
    await settle()
    await advance(5000)
    expect(progress().at(-1).outcome).toEqual({ kind: 'seats-in-use', activations: seats })

    const outcome = await service.handlers['licence/activate'](null, { replaceActivationId: 'act_old' })
    expect(outcome.kind).toBe('activated')
    expect(fetch.calls.filter((call) => call.url.endsWith('/licences/activate')).at(-1).body.replaceActivationId).toBe('act_old')
    expect(await service.handlers['licence/activate'](null, {})).toEqual({ kind: 'session-expired' })
  })

  it.each([
    [429, { error: 'move-limit', retryAt: '2026-10-01T00:00:00.000Z' }, { kind: 'move-limit', retryAt: '2026-10-01T00:00:00.000Z' }],
    [403, { error: 'licence-mode-mismatch' }, { kind: 'mode-mismatch' }],
    [403, { error: 'replacement-not-yours' }, { kind: 'replacement-not-yours' }],
    [401, {}, { kind: 'session-expired' }],
    [500, { error: 'boom' }, { kind: 'error', message: 'boom' }],
  ])('maps an activate %i answer to the installer outcome', async (status, body, expected) => {
    const fetch = routedFetch([
      { path: '/api/auth/device/code', reply: jsonResponse(200, deviceCode) },
      { path: '/api/auth/device/token', reply: jsonResponse(200, { access_token: 'sess_4' }) },
      { path: '/licences/activate', reply: jsonResponse(status, body) },
    ])
    const { service, progress, readRecord, broadcast } = makeService({ fetch })
    activeService = service
    service.start(broadcast)
    service.handlers['licence/sign-in']()
    await settle()
    await advance(5000)
    expect(progress().at(-1).outcome).toEqual(expected)
    expect(readRecord()).toBeNull()
  })

  it('never sends a request when the device id cannot be read', async () => {
    const fetch = routedFetch([
      { path: '/api/auth/device/code', reply: jsonResponse(200, deviceCode) },
      { path: '/api/auth/device/token', reply: jsonResponse(200, { access_token: 'sess_5' }) },
      { path: '/licences/activate', reply: jsonResponse(200, activated) },
    ])
    const { service, progress, broadcast } = makeService({ fetch, readDeviceId: () => null })
    activeService = service
    service.start(broadcast)
    service.handlers['licence/sign-in']()
    await settle()
    await advance(5000)
    expect(progress().at(-1).outcome).toEqual({ kind: 'device-unreadable' })
    expect(fetch.calls.some((call) => call.url.endsWith('/licences/activate'))).toBe(false)
  })
})

describe('release and links', () => {
  it('releases the activation with the secret, deletes the file and reports unlicensed', async () => {
    const fetch = routedFetch([{ path: '/licences/release-self', reply: jsonResponse(200, { ok: true }) }])
    const { service, readRecord, changed, broadcast } = makeService({ files: { [LICENCE_PATH]: JSON.stringify(licenceRecord()) }, fetch })
    activeService = service
    service.start(broadcast)
    const status = await service.handlers['licence/release']()
    expect(fetch.calls[0]).toMatchObject({ url: `${AUTH_BASE}/licences/release-self`, headers: { Authorization: 'Activation act_1.secret-1' } })
    expect(readRecord()).toBeNull()
    expect(status.state).toBe('unlicensed')
    expect(changed().at(-1).state).toBe('unlicensed')
  })

  it('still deletes the file when the release request fails', async () => {
    const fetch = routedFetch([{ path: '/licences/release-self', reply: new TypeError('fetch failed') }])
    const { service, readRecord } = makeService({ files: { [LICENCE_PATH]: JSON.stringify(licenceRecord()) }, fetch })
    await service.handlers['licence/release']()
    expect(readRecord()).toBeNull()
  })

  it('opens the checkout and account pages on the website', async () => {
    const { service, openExternal } = makeService()
    await service.handlers['licence/open-checkout']()
    await service.handlers['licence/open-account']()
    expect(openExternal).toHaveBeenNthCalledWith(1, `${WEBSITE_BASE}/checkout?from=installer`)
    expect(openExternal).toHaveBeenNthCalledWith(2, `${WEBSITE_BASE}/account`)
  })

  it('opens the licence window through the registered opener', () => {
    const { service } = makeService()
    expect(service.openLicenceWindow()).toBe(false)
    const opener = vi.fn()
    service.setLicenceWindowOpener(opener)
    expect(service.openLicenceWindow()).toBe(true)
    expect(opener).toHaveBeenCalledTimes(1)
  })
})

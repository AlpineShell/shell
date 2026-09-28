import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import crypto from 'crypto'
import path from 'path'
import { createRequire } from 'module'

const nodeRequire = createRequire(import.meta.url)

const { createLicenceService, handlers: guardedDefaultHandlers, NO_LICENCE_RECHECK_MS } = await import('./licence.js')
const { setTrustedWindowsAccessor, UNTRUSTED_SENDER, SETUP_WINDOW, SETTINGS_WINDOW } = nodeRequire('../trustedSenders.js')

const NOW = Date.UTC(2026, 8, 18, 12, 0, 0)
const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
const YEAR_MS = 365 * DAY_MS
const AUTH_BASE = 'https://auth.alpineshell.com'
const WEBSITE_BASE = 'https://alpineshell.com'
const DEVICE_ID = 'a'.repeat(64)
const BIND_HASH = crypto.createHash('sha256').update('this-pc-binding').digest('base64url')
const OTHER_BIND_HASH = crypto.createHash('sha256').update('another-pc-binding').digest('base64url')
const BIND_CLAIM = { tier: 'tpm', hash: BIND_HASH }
const USER_DATA = path.resolve(path.join(path.sep, 'alpine-test', 'userData'))
const LICENCE_PATH = path.join(USER_DATA, 'licence.json')

function makeKeyPair(kid) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
  return { kid, privateKey, spkiPem: publicKey.export({ type: 'spki', format: 'pem' }).toString() }
}

const signingKey = makeKeyPair('lic-2026-09')
const publicKeys = [{ kid: signingKey.kid, spkiPem: signingKey.spkiPem }]

function base64url(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function mintToken(claimOverrides = {}, key = signingKey) {
  const header = { alg: 'EdDSA', kid: key.kid, typ: 'alpine-licence+jwt' }
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
    ...claimOverrides,
  }
  const signingInput = `${base64url(header)}.${base64url(claims)}`
  const signature = crypto.sign(null, Buffer.from(signingInput), key.privateKey)
  return `${signingInput}.${signature.toString('base64url')}`
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
    renameSync: (from, to) => {
      if (!files.has(from)) throw new Error(`ENOENT ${from}`)
      files.set(to, files.get(from))
      files.delete(from)
    },
    unlinkSync: (file) => {
      files.delete(file)
    },
  }
}

function licenceRecord(overrides = {}) {
  return {
    token: mintToken(),
    activationId: 'act_1',
    email: 'someone@example.com',
    licenceId: 'lic_1',
    deviceName: 'Study PC',
    activatedAt: new Date(NOW - 2 * DAY_MS).toISOString(),
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

function fakeBinding({ produced = BIND_CLAIM, reproducible = [BIND_HASH] } = {}) {
  return {
    produce: vi.fn(() => (produced ? { ...produced } : null)),
    verify: vi.fn((claim) => Boolean(claim) && reproducible.includes(claim.hash)),
    forget: vi.fn(),
    discard: vi.fn(),
  }
}

function makeService({ files = {}, fetch, config = {}, readDeviceId = () => DEVICE_ID, fileSystem = memoryFileSystem(files), binding = fakeBinding() } = {}) {
  const broadcasts = []
  const openExternal = vi.fn(async () => undefined)
  const service = createLicenceService({
    config: { isReleaseBuild: true, authBase: AUTH_BASE, websiteBase: WEBSITE_BASE, publicKeys, enforceInDevelopment: false, ...config },
    fileSystem,
    userDataDirectory: () => USER_DATA,
    appVersion: () => '1.2.3',
    openExternal,
    fetch: fetch ?? routedFetch([]),
    readDeviceId,
    readDeviceName: () => 'DESKTOP-ABC123',
    binding,
    log: () => undefined,
  })
  const broadcast = (channel, payload) => broadcasts.push({ channel, payload })
  const readRecord = () => (fileSystem.files.has(LICENCE_PATH) ? JSON.parse(fileSystem.files.get(LICENCE_PATH)) : null)
  const changed = () => broadcasts.filter((b) => b.channel === 'licence/changed').map((b) => b.payload)
  const progress = () => broadcasts.filter((b) => b.channel === 'licence/sign-in-progress').map((b) => b.payload)
  return { service, fileSystem, broadcasts, broadcast, readRecord, changed, progress, openExternal, binding }
}

function withLicence(overrides = {}, serviceOptions = {}) {
  return makeService({ files: { [LICENCE_PATH]: JSON.stringify(licenceRecord(overrides)) }, ...serviceOptions })
}

async function settle() {
  for (let i = 0; i < 10; i += 1) await new Promise((resolve) => setImmediate(resolve))
}

async function advance(ms) {
  await vi.advanceTimersByTimeAsync(ms)
  await settle()
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('status from disk', () => {
  it('is unlicensed with the reason missing when there is no licence file', () => {
    expect(makeService().service.status()).toMatchObject({ state: 'unlicensed', reason: 'missing', email: null, deviceReadable: true, releaseBuild: true })
  })

  it('is unlicensed with the reason unreadable when the file is corrupt', () => {
    for (const content of ['{not json', '[]', 'null', '']) {
      const { service } = makeService({ files: { [LICENCE_PATH]: content } })
      expect(service.status()).toMatchObject({ state: 'unlicensed', reason: 'unreadable' })
    }
  })

  it('is unlicensed with the reason unverifiable when the token was not signed by a baked key', () => {
    const rogue = makeKeyPair(signingKey.kid)
    const { service } = withLicence({ token: mintToken({}, rogue) })
    expect(service.status()).toMatchObject({ state: 'unlicensed', reason: 'unverifiable', email: 'someone@example.com' })
    expect(withLicence({ token: 'garbage' }).service.status()).toMatchObject({ state: 'unlicensed', reason: 'unverifiable' })
  })

  it('is unlicensed with the reason device-mismatch when the token belongs to another PC', () => {
    const { service } = withLicence({ token: mintToken({ dev: 'b'.repeat(64) }) })
    expect(service.status()).toMatchObject({ state: 'unlicensed', reason: 'device-mismatch' })
  })

  it('is valid with a signed token for this device and carries the record details', () => {
    const { service } = withLicence()
    expect(service.status()).toEqual({
      state: 'valid',
      reason: null,
      email: 'someone@example.com',
      licenceId: 'lic_1',
      activationId: 'act_1',
      deviceName: 'Study PC',
      activatedAt: new Date(NOW - 2 * DAY_MS).toISOString(),
      bindTier: null,
      deviceReadable: true,
      releaseBuild: true,
    })
  })

  it('is valid with a token bound to a proof this PC reproduces, and reports the tier', () => {
    const { service, binding } = withLicence({ token: mintToken({ bind: BIND_CLAIM }), bindTier: 'tpm' })
    expect(service.status()).toMatchObject({ state: 'valid', bindTier: 'tpm' })
    expect(binding.verify).toHaveBeenCalledWith(BIND_CLAIM)
  })

  it('is unlicensed with the reason binding-mismatch when the proof cannot be reproduced on this PC', () => {
    const { service } = withLicence({ token: mintToken({ bind: { tier: 'tpm', hash: OTHER_BIND_HASH } }), bindTier: 'tpm' })
    expect(service.status()).toMatchObject({ state: 'unlicensed', reason: 'binding-mismatch', email: 'someone@example.com', bindTier: 'tpm' })
    expect(service.currentToken()).toBeNull()
    expect(() => service.requireValid()).toThrow('licence-required')
  })

  it('keeps an activation with no bind claim working without ever asking for a proof', () => {
    const { service, binding } = withLicence({}, { binding: fakeBinding({ reproducible: [] }) })
    expect(service.status()).toMatchObject({ state: 'valid', bindTier: null })
    expect(binding.verify).not.toHaveBeenCalled()
    expect(binding.produce).not.toHaveBeenCalled()
  })

  it('takes the tier from the token when the record predates the tier field', () => {
    const { service } = withLicence({ token: mintToken({ bind: { tier: 'dpapi', hash: BIND_HASH } }) })
    expect(service.status()).toMatchObject({ state: 'valid', bindTier: 'dpapi' })
  })

  it('stays valid forever with a token that carries no expiry, even offline for decades', () => {
    const fetch = routedFetch([])
    const { service, broadcast } = withLicence({}, { fetch })
    service.start(broadcast)
    expect(service.status().state).toBe('valid')
    vi.setSystemTime(NOW + 50 * YEAR_MS)
    expect(service.status().state).toBe('valid')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('still honours an expiry when a token carries one', () => {
    const { service } = withLicence({ token: mintToken({ exp: Math.floor((NOW + DAY_MS) / 1000) }) })
    expect(service.status().state).toBe('valid')
    vi.setSystemTime(NOW + 2 * DAY_MS)
    expect(service.status()).toMatchObject({ state: 'unlicensed', reason: 'unverifiable' })
  })

  it('is development when the build is not a release', () => {
    const { service } = makeService({ config: { isReleaseBuild: false } })
    expect(service.status()).toMatchObject({ state: 'development', releaseBuild: false })
  })

  it('exposes the token only while valid', () => {
    const valid = withLicence()
    expect(valid.service.currentToken()).toBe(valid.readRecord().token)
    expect(withLicence({ token: mintToken({ dev: 'b'.repeat(64) }) }).service.currentToken()).toBeNull()
    expect(makeService().service.currentToken()).toBeNull()
    expect(makeService({ config: { isReleaseBuild: false } }).service.currentToken()).toBeNull()
  })

  it('requireValid throws licence-required only when unlicensed', () => {
    expect(() => makeService().service.requireValid()).toThrow('licence-required')
    expect(() => makeService({ files: { [LICENCE_PATH]: '{not json' } }).service.requireValid()).toThrow('licence-required')
    expect(withLicence().service.requireValid().state).toBe('valid')
    expect(makeService({ config: { isReleaseBuild: false } }).service.requireValid().state).toBe('development')
  })

  it('trusts the signature and reports deviceReadable false when MachineGuid cannot be read', () => {
    const { service } = withLicence({}, { readDeviceId: () => null })
    expect(service.status()).toMatchObject({ state: 'valid', deviceReadable: false })
  })

  it('reads the device id once per evaluation so the state and deviceReadable never disagree', () => {
    let reads = 0
    const readDeviceId = () => {
      reads += 1
      return reads === 1 ? null : DEVICE_ID
    }
    const { service } = withLicence({}, { readDeviceId })
    expect(service.status()).toMatchObject({ state: 'valid', deviceReadable: false })
    expect(reads).toBe(1)
    expect(service.status()).toMatchObject({ state: 'valid', deviceReadable: true })
    expect(reads).toBe(2)
  })

  it('never writes to the licence file just by reading the status', () => {
    const { service, fileSystem } = withLicence()
    const before = fileSystem.files.get(LICENCE_PATH)
    service.status()
    service.currentToken()
    service.requireValid()
    expect(fileSystem.files.get(LICENCE_PATH)).toBe(before)
  })
})

describe('after activation the desktop never calls the account service', () => {
  it('schedules no request after start, across boots, days and years', async () => {
    const fetch = routedFetch([{ path: '/licences/refresh', reply: jsonResponse(200, {}) }])
    const { service, broadcast } = withLicence({}, { fetch })
    service.start(broadcast)
    await advance(400 * DAY_MS)
    expect(fetch).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    expect(service.status().state).toBe('valid')
  })

  it('offers no channel that would refresh or re-evaluate against the server', () => {
    const { service } = withLicence()
    expect(Object.keys(service.handlers).sort()).toEqual([
      'licence/activate',
      'licence/cancel-sign-in',
      'licence/open-account',
      'licence/open-checkout',
      'licence/release',
      'licence/sign-in',
      'licence/sign-in-state',
      'licence/status',
    ])
  })
})

describe('the device flow sign-in', () => {
  const deviceCode = { device_code: 'dc_1', user_code: 'ABCD-EFGH', verification_uri: 'https://alpineshell.com/device', verification_uri_complete: 'https://alpineshell.com/device?user_code=ABCD-EFGH', interval: 5, expires_in: 600 }
  const activated = {
    token: mintToken({ jti: 'activated' }),
    activationId: 'act_9',
    licence: { id: 'lic_9' },
    account: { email: 'buyer@example.com' },
  }

  it('opens the browser, polls until approval, activates with the chosen PC name, signs out and writes the file', async () => {
    let tokenPolls = 0
    const fetch = routedFetch([
      { path: '/api/auth/device/code', reply: jsonResponse(200, deviceCode) },
      { path: '/api/auth/device/token', reply: () => { tokenPolls += 1; return tokenPolls < 3 ? jsonResponse(400, { error: 'authorization_pending' }) : jsonResponse(200, { access_token: 'sess_1', token_type: 'Bearer' }) } },
      { path: '/licences/activate', reply: jsonResponse(200, activated) },
      { path: '/api/auth/sign-out', reply: jsonResponse(200, { success: true }) },
    ])
    const { service, readRecord, changed, progress, openExternal, broadcast } = makeService({ fetch })
    service.start(broadcast)

    const started = service.handlers['licence/sign-in'](null, { deviceName: '  Study PC  ' })
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
    expect(activateCall.body).toEqual({ deviceId: DEVICE_ID, deviceName: 'Study PC', appVersion: '1.2.3', binding: { tier: 'tpm', hash: BIND_HASH } })

    const signOut = fetch.calls.find((call) => call.url.endsWith('/api/auth/sign-out'))
    expect(signOut.headers.Authorization).toBe('Bearer sess_1')

    const record = readRecord()
    expect(record).toEqual({
      token: activated.token,
      activationId: 'act_9',
      email: 'buyer@example.com',
      licenceId: 'lic_9',
      deviceName: 'Study PC',
      activatedAt: new Date(NOW + 15000).toISOString(),
      bindTier: null,
    })
    expect(JSON.stringify(record)).not.toContain('sess_1')

    expect(progress().map((p) => p.phase)).toEqual(['idle', 'starting', 'waiting', 'activating', 'done'])
    expect(progress().at(-1).outcome).toEqual({ kind: 'activated', email: 'buyer@example.com', licenceId: 'lic_9' })
    expect(changed().at(-1)).toMatchObject({ state: 'valid', email: 'buyer@example.com', deviceName: 'Study PC' })
    expect(service.status().state).toBe('valid')
  })

  it('sends the Windows computer name when no name was chosen and caps a long one', async () => {
    const fetch = routedFetch([
      { path: '/api/auth/device/code', reply: () => jsonResponse(200, deviceCode) },
      { path: '/api/auth/device/token', reply: () => jsonResponse(200, { access_token: 'sess_2' }) },
      { path: '/licences/activate', reply: () => jsonResponse(200, activated) },
      { path: '/api/auth/sign-out', reply: () => jsonResponse(200, {}) },
    ])
    const activateBodies = () => fetch.calls.filter((call) => call.url.endsWith('/licences/activate')).map((call) => call.body)

    const blank = makeService({ fetch })
    blank.service.handlers['licence/sign-in'](null, { deviceName: '   ' })
    await settle()
    await advance(5000)
    expect(activateBodies().at(-1).deviceName).toBe('DESKTOP-ABC123')

    const unnamed = makeService({ fetch })
    unnamed.service.handlers['licence/sign-in']()
    await settle()
    await advance(5000)
    expect(activateBodies().at(-1).deviceName).toBe('DESKTOP-ABC123')

    const long = makeService({ fetch })
    long.service.handlers['licence/sign-in'](null, { deviceName: 'x'.repeat(100) })
    await settle()
    await advance(5000)
    expect(activateBodies().at(-1).deviceName).toBe('x'.repeat(64))
  })

  it('stores nothing but the token and the display details, even when the server still sends a secret', async () => {
    const fetch = routedFetch([
      { path: '/api/auth/device/code', reply: jsonResponse(200, deviceCode) },
      { path: '/api/auth/device/token', reply: jsonResponse(200, { access_token: 'sess_3' }) },
      { path: '/licences/activate', reply: jsonResponse(200, { ...activated, activationSecret: 'secret-9', expiresAt: null, serverTime: new Date(NOW).toISOString() }) },
      { path: '/api/auth/sign-out', reply: jsonResponse(200, {}) },
    ])
    const { service, readRecord } = makeService({ fetch })
    service.handlers['licence/sign-in'](null, { deviceName: 'Study PC' })
    await settle()
    await advance(5000)
    expect(Object.keys(readRecord()).sort()).toEqual(['activatedAt', 'activationId', 'bindTier', 'deviceName', 'email', 'licenceId', 'token'])
    expect(JSON.stringify(readRecord())).not.toContain('secret-9')
  })

  it('sends only the binding tier and hash, records the tier the server bound and forgets stale verdicts', async () => {
    const binding = fakeBinding({ produced: { tier: 'dpapi', hash: BIND_HASH, secret: 'never-sent', publicBlob: 'never-sent' } })
    const bound = { ...activated, token: mintToken({ jti: 'bound', bind: { tier: 'dpapi', hash: BIND_HASH } }) }
    const fetch = routedFetch([
      { path: '/api/auth/device/code', reply: jsonResponse(200, deviceCode) },
      { path: '/api/auth/device/token', reply: jsonResponse(200, { access_token: 'sess_7' }) },
      { path: '/licences/activate', reply: jsonResponse(200, bound) },
      { path: '/api/auth/sign-out', reply: jsonResponse(200, {}) },
    ])
    const { service, readRecord, broadcast } = makeService({ fetch, binding })
    service.start(broadcast)
    service.handlers['licence/sign-in'](null, { deviceName: 'Study PC' })
    await settle()
    await advance(5000)
    const sent = fetch.calls.find((call) => call.url.endsWith('/licences/activate')).body
    expect(sent.binding).toEqual({ tier: 'dpapi', hash: BIND_HASH })
    expect(sent).not.toHaveProperty('bind')
    expect(JSON.stringify(fetch.calls)).not.toContain('never-sent')
    expect(readRecord()).toMatchObject({ bindTier: 'dpapi' })
    expect(binding.forget).toHaveBeenCalledTimes(1)
    expect(service.status()).toMatchObject({ state: 'valid', bindTier: 'dpapi' })
  })

  it('produces the binding once per sign-in, even while re-checking a 402 every 10 seconds', async () => {
    let activations = 0
    const fetch = routedFetch([
      { path: '/api/auth/device/code', reply: jsonResponse(200, deviceCode) },
      { path: '/api/auth/device/token', reply: jsonResponse(200, { access_token: 'sess_8' }) },
      { path: '/licences/activate', reply: () => { activations += 1; return activations < 3 ? jsonResponse(402, { error: 'no-licence' }) : jsonResponse(200, activated) } },
      { path: '/api/auth/sign-out', reply: jsonResponse(200, {}) },
    ])
    const { service, binding, broadcast } = makeService({ fetch })
    service.start(broadcast)
    service.handlers['licence/sign-in']()
    await settle()
    await advance(5000)
    await advance(2 * NO_LICENCE_RECHECK_MS)
    expect(activations).toBe(3)
    expect(binding.produce).toHaveBeenCalledTimes(1)
    expect(fetch.calls.filter((call) => call.url.endsWith('/licences/activate')).every((call) => call.body.binding.hash === BIND_HASH)).toBe(true)
  })

  it('activates without a binding when no tier is usable, and the token then carries none', async () => {
    const fetch = routedFetch([
      { path: '/api/auth/device/code', reply: jsonResponse(200, deviceCode) },
      { path: '/api/auth/device/token', reply: jsonResponse(200, { access_token: 'sess_9' }) },
      { path: '/licences/activate', reply: jsonResponse(200, activated) },
      { path: '/api/auth/sign-out', reply: jsonResponse(200, {}) },
    ])
    const { service, readRecord, broadcast } = makeService({ fetch, binding: fakeBinding({ produced: null, reproducible: [] }) })
    service.start(broadcast)
    service.handlers['licence/sign-in']()
    await settle()
    await advance(5000)
    const sent = fetch.calls.find((call) => call.url.endsWith('/licences/activate')).body
    expect(sent).not.toHaveProperty('binding')
    expect(readRecord()).toMatchObject({ bindTier: null })
    expect(service.status().state).toBe('valid')
  })

  it('refuses a token bound to a proof this PC cannot reproduce instead of writing it', async () => {
    const fetch = routedFetch([
      { path: '/api/auth/device/code', reply: jsonResponse(200, deviceCode) },
      { path: '/api/auth/device/token', reply: jsonResponse(200, { access_token: 'sess_10' }) },
      { path: '/licences/activate', reply: jsonResponse(200, { ...activated, token: mintToken({ bind: { tier: 'tpm', hash: OTHER_BIND_HASH } }) }) },
    ])
    const { service, progress, readRecord, broadcast } = makeService({ fetch })
    service.start(broadcast)
    service.handlers['licence/sign-in']()
    await settle()
    await advance(5000)
    expect(progress().at(-1).outcome).toEqual({ kind: 'error', message: 'binding-unverifiable' })
    expect(readRecord()).toBeNull()
  })

  it('adds five seconds on slow_down and reports a denial', async () => {
    let tokenPolls = 0
    const fetch = routedFetch([
      { path: '/api/auth/device/code', reply: jsonResponse(200, deviceCode) },
      { path: '/api/auth/device/token', reply: () => { tokenPolls += 1; return tokenPolls === 1 ? jsonResponse(400, { error: 'slow_down' }) : jsonResponse(400, { error: 'access_denied' }) } },
    ])
    const { service, progress, broadcast } = makeService({ fetch })
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
    service.start(broadcast)
    service.handlers['licence/sign-in'](null, { deviceName: 'Study PC' })
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
    expect(readRecord()).toMatchObject({ activationId: 'act_9', deviceName: 'Study PC' })
    expect(fetch.calls.filter((call) => call.url.endsWith('/licences/activate')).every((call) => call.body.deviceName === 'Study PC')).toBe(true)

    await advance(10 * NO_LICENCE_RECHECK_MS)
    expect(activations).toBe(3)
  })

  it('lets the installer move a seat here with replaceActivationId and lists when each seat was activated', async () => {
    const seats = [{ id: 'act_old', licenceId: 'lic_9', deviceName: 'OLD-PC', activatedAt: new Date(NOW - DAY_MS).toISOString() }]
    let activations = 0
    const fetch = routedFetch([
      { path: '/api/auth/device/code', reply: jsonResponse(200, deviceCode) },
      { path: '/api/auth/device/token', reply: jsonResponse(200, { access_token: 'sess_3' }) },
      { path: '/licences/activate', reply: () => { activations += 1; return activations === 1 ? jsonResponse(409, { error: 'seats-in-use', activations: seats }) : jsonResponse(200, activated) } },
      { path: '/api/auth/sign-out', reply: jsonResponse(200, {}) },
    ])
    const { service, progress, broadcast } = makeService({ fetch })
    service.start(broadcast)
    service.handlers['licence/sign-in'](null, { deviceName: 'Study PC' })
    await settle()
    await advance(5000)
    expect(progress().at(-1).outcome).toEqual({ kind: 'seats-in-use', activations: seats })

    const outcome = await service.handlers['licence/activate'](null, { replaceActivationId: 'act_old' })
    expect(outcome.kind).toBe('activated')
    const replacement = fetch.calls.filter((call) => call.url.endsWith('/licences/activate')).at(-1).body
    expect(replacement).toMatchObject({ replaceActivationId: 'act_old', deviceName: 'Study PC' })
    expect(await service.handlers['licence/activate'](null, {})).toEqual({ kind: 'session-expired' })
  })

  it.each([
    [429, { error: 'move-limit', retryAt: '2026-10-01T00:00:00.000Z' }, { kind: 'move-limit', retryAt: '2026-10-01T00:00:00.000Z' }],
    [429, { error: 'rate-limited' }, { kind: 'error', message: 'rate-limited' }],
    [403, { error: 'licence-mode-mismatch' }, { kind: 'mode-mismatch' }],
    [403, { error: 'replacement-not-yours' }, { kind: 'replacement-not-yours' }],
    [401, {}, { kind: 'session-expired' }],
    [500, { error: 'boom' }, { kind: 'error', message: 'boom' }],
    [200, { activationId: 'act_9' }, { kind: 'error', message: 'activate-incomplete' }],
  ])('maps an activate %i answer to the installer outcome', async (status, body, expected) => {
    const fetch = routedFetch([
      { path: '/api/auth/device/code', reply: jsonResponse(200, deviceCode) },
      { path: '/api/auth/device/token', reply: jsonResponse(200, { access_token: 'sess_4' }) },
      { path: '/licences/activate', reply: jsonResponse(status, body) },
    ])
    const { service, progress, readRecord, broadcast } = makeService({ fetch })
    service.start(broadcast)
    service.handlers['licence/sign-in']()
    await settle()
    await advance(5000)
    expect(progress().at(-1).outcome).toEqual(expected)
    expect(readRecord()).toBeNull()
  })

  it('refuses a token this build cannot verify instead of writing it', async () => {
    const rogue = makeKeyPair(signingKey.kid)
    const fetch = routedFetch([
      { path: '/api/auth/device/code', reply: jsonResponse(200, deviceCode) },
      { path: '/api/auth/device/token', reply: jsonResponse(200, { access_token: 'sess_6' }) },
      { path: '/licences/activate', reply: jsonResponse(200, { ...activated, token: mintToken({}, rogue) }) },
    ])
    const { service, progress, readRecord, broadcast } = makeService({ fetch })
    service.start(broadcast)
    service.handlers['licence/sign-in']()
    await settle()
    await advance(5000)
    expect(progress().at(-1).outcome).toEqual({ kind: 'error', message: 'token-unverifiable' })
    expect(readRecord()).toBeNull()
  })

  it('never sends a request when the device id cannot be read', async () => {
    const fetch = routedFetch([
      { path: '/api/auth/device/code', reply: jsonResponse(200, deviceCode) },
      { path: '/api/auth/device/token', reply: jsonResponse(200, { access_token: 'sess_5' }) },
      { path: '/licences/activate', reply: jsonResponse(200, activated) },
    ])
    const { service, progress, broadcast } = makeService({ fetch, readDeviceId: () => null })
    service.start(broadcast)
    service.handlers['licence/sign-in']()
    await settle()
    await advance(5000)
    expect(progress().at(-1).outcome).toEqual({ kind: 'device-unreadable' })
    expect(fetch.calls.some((call) => call.url.endsWith('/licences/activate'))).toBe(false)
  })

})

describe('release and links', () => {
  it('releases the activation with the licence token, deletes the file and the binding material, and reports unlicensed', async () => {
    const fetch = routedFetch([{ path: '/licences/release-self', reply: jsonResponse(200, { ok: true }) }])
    const { service, readRecord, changed, broadcast, binding } = withLicence({}, { fetch })
    const token = readRecord().token
    service.start(broadcast)
    const status = await service.handlers['licence/release']()
    expect(fetch.calls[0]).toMatchObject({ url: `${AUTH_BASE}/licences/release-self`, headers: { Authorization: `Bearer ${token}` } })
    expect(readRecord()).toBeNull()
    expect(binding.discard).toHaveBeenCalledTimes(1)
    expect(status).toMatchObject({ state: 'unlicensed', reason: 'missing' })
    expect(changed().at(-1)).toMatchObject({ state: 'unlicensed', reason: 'missing' })
  })

  it('still deletes the file when the release request fails', async () => {
    const fetch = routedFetch([{ path: '/licences/release-self', reply: new TypeError('fetch failed') }])
    const { service, readRecord } = withLicence({}, { fetch })
    await service.handlers['licence/release']()
    expect(readRecord()).toBeNull()
  })

  it('sends nothing when there is no valid token to release with', async () => {
    const fetch = routedFetch([{ path: '/licences/release-self', reply: jsonResponse(200, {}) }])
    const { service } = withLicence({ token: mintToken({ dev: 'b'.repeat(64) }) }, { fetch })
    expect(await service.releaseSelf()).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('opens the checkout and account pages on the website', async () => {
    const { service, openExternal } = makeService()
    await service.handlers['licence/open-checkout']()
    await service.handlers['licence/open-account']()
    expect(openExternal).toHaveBeenNthCalledWith(1, `${WEBSITE_BASE}/checkout?from=installer`)
    expect(openExternal).toHaveBeenNthCalledWith(2, `${WEBSITE_BASE}/account`)
  })
})

describe('the sender guard on the exported handlers', () => {
  afterEach(() => {
    setTrustedWindowsAccessor(null)
  })

  it('answers every licence channel only from the setup window', () => {
    const desktopWindow = { webContents: { id: 7 }, isDestroyed: () => false }
    const settingsWindow = { webContents: { id: 8 }, isDestroyed: () => false }
    const setupWindow = { webContents: { id: 9 }, isDestroyed: () => false }
    setTrustedWindowsAccessor(() => ({ [SETUP_WINDOW]: setupWindow, [SETTINGS_WINDOW]: settingsWindow }))
    const fromDesktop = { sender: desktopWindow.webContents }
    const fromSettings = { sender: settingsWindow.webContents }
    const fromSetup = { sender: setupWindow.webContents }
    for (const channel of Object.keys(guardedDefaultHandlers)) {
      expect(() => guardedDefaultHandlers[channel](fromDesktop)).toThrow(UNTRUSTED_SENDER)
      expect(() => guardedDefaultHandlers[channel](fromSettings)).toThrow(UNTRUSTED_SENDER)
    }
    expect(guardedDefaultHandlers['licence/sign-in-state'](fromSetup)).toMatchObject({ phase: 'idle' })
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'

const { canonicalJson, verifyRevocationList, findRevocation, createRevocationWatcher, FIRST_CHECK_DELAY_MS, CHECK_INTERVAL_MS } = await import(
  './pluginRevocations.js'
)

const marketplaceKeys = crypto.generateKeyPairSync('ed25519')
const otherKeys = crypto.generateKeyPairSync('ed25519')
const PUBLIC_KEY = marketplaceKeys.publicKey.export({ type: 'spki', format: 'pem' }).toString()
const LIST_URL = 'https://plugins.example.com/plugins/revoked.json'

function signedList(revoked, { issuedAt = '2026-11-03T10:00:00.000Z', privateKey = marketplaceKeys.privateKey } = {}) {
  const doc = { version: 1, issuedAt, revoked }
  const signature = crypto.sign(null, Buffer.from(canonicalJson(doc), 'utf8'), privateKey).toString('base64')
  return { ...doc, signature }
}

const MALWARE = { id: 'com.example.notes', version: null, reason: 'Sends your files to a server.' }
const BAD_RELEASE = { id: 'com.example.weather', version: '1.2.0', reason: 'Crashes on start.' }

let workDir = ''

beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alpine-revocations-'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  fs.rmSync(workDir, { recursive: true, force: true })
})

describe('canonical JSON', () => {
  it('sorts keys at every depth and keeps array order', () => {
    expect(canonicalJson({ b: 1, a: [{ z: 1, y: null }, 2] })).toBe('{"a":[{"y":null,"z":1},2],"b":1}')
  })
})

describe('verifying the revocation list', () => {
  const keys = { publicKey: PUBLIC_KEY, allowUnsigned: false }

  it('accepts a list signed with the marketplace key', () => {
    const result = verifyRevocationList(signedList([MALWARE, BAD_RELEASE]), keys)
    expect(result).toMatchObject({ ok: true, unsigned: false })
    expect(result.entries).toEqual([MALWARE, BAD_RELEASE])
  })

  it('accepts a signed list whose keys arrive in another order', () => {
    const doc = signedList([MALWARE])
    const reordered = { signature: doc.signature, revoked: [{ reason: MALWARE.reason, version: null, id: MALWARE.id }], issuedAt: doc.issuedAt, version: 1 }
    expect(verifyRevocationList(reordered, keys)).toMatchObject({ ok: true })
  })

  it('refuses a list changed after signing', () => {
    const doc = signedList([MALWARE])
    expect(verifyRevocationList({ ...doc, revoked: [] }, keys)).toEqual({ ok: false, reason: 'bad-signature' })
    expect(verifyRevocationList({ ...doc, issuedAt: '2027-01-01T00:00:00.000Z' }, keys)).toEqual({ ok: false, reason: 'bad-signature' })
  })

  it('refuses a list signed with another key', () => {
    expect(verifyRevocationList(signedList([MALWARE], { privateKey: otherKeys.privateKey }), keys)).toEqual({ ok: false, reason: 'bad-signature' })
  })

  it('refuses an unsigned list when there is a key', () => {
    const unsigned = signedList([MALWARE])
    delete unsigned.signature
    expect(verifyRevocationList(unsigned, keys)).toEqual({ ok: false, reason: 'bad-signature' })
  })

  it('accepts an unsigned list only in a development build without a key', () => {
    const unsigned = { version: 1, issuedAt: '2026-11-03T10:00:00.000Z', revoked: [MALWARE] }
    expect(verifyRevocationList(unsigned, { publicKey: null, allowUnsigned: true })).toMatchObject({ ok: true, unsigned: true, entries: [MALWARE] })
    expect(verifyRevocationList(unsigned, { publicKey: null, allowUnsigned: false })).toEqual({ ok: false, reason: 'no-key' })
  })

  it('refuses a list of the wrong shape', () => {
    const dev = { publicKey: null, allowUnsigned: true }
    expect(verifyRevocationList(null, dev)).toMatchObject({ ok: false, reason: 'malformed' })
    expect(verifyRevocationList({ version: 2, revoked: [] }, dev)).toMatchObject({ ok: false, reason: 'malformed' })
    expect(verifyRevocationList({ version: 1, revoked: [{ version: '1.0.0' }] }, dev)).toMatchObject({ ok: false, reason: 'malformed' })
  })
})

describe('finding a revocation', () => {
  const entries = [MALWARE, BAD_RELEASE]

  it('matches every version when the revocation names none', () => {
    expect(findRevocation(entries, 'com.example.notes', '1.0.0')).toEqual(MALWARE)
    expect(findRevocation(entries, 'com.example.notes', '9.9.9')).toEqual(MALWARE)
  })

  it('matches only the named version when there is one', () => {
    expect(findRevocation(entries, 'com.example.weather', '1.2.0')).toEqual(BAD_RELEASE)
    expect(findRevocation(entries, 'com.example.weather', '1.2.1')).toBeNull()
  })

  it('matches nothing for another plugin', () => {
    expect(findRevocation(entries, 'com.example.clock', '1.0.0')).toBeNull()
    expect(findRevocation(null, 'com.example.notes', '1.0.0')).toBeNull()
  })
})

function serve(...responses) {
  const queue = [...responses]
  return vi.fn(async () => {
    const next = queue.length > 1 ? queue.shift() : queue[0]
    if (next instanceof Error) throw next
    if (next === 404) return new Response(null, { status: 404 })
    return new Response(JSON.stringify(next))
  })
}

function watcher(fetchImpl, onChange = vi.fn()) {
  return createRevocationWatcher({
    cacheFile: path.join(workDir, 'plugin-revocations.json'),
    listUrl: () => LIST_URL,
    keys: () => ({ publicKey: PUBLIC_KEY, allowUnsigned: false }),
    fetchImpl,
    onChange,
  })
}

describe('keeping the revocation list', () => {
  it('starts empty and adopts a fetched list, telling who listens', async () => {
    const onChange = vi.fn()
    const kept = watcher(serve(signedList([MALWARE])), onChange)
    expect(kept.current()).toEqual([])
    const result = await kept.refresh()
    expect(result).toMatchObject({ ok: true, changed: true })
    expect(kept.current()).toEqual([MALWARE])
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('falls back to the last good list when offline', async () => {
    await watcher(serve(signedList([MALWARE]))).refresh()
    const offline = watcher(serve(new Error('getaddrinfo ENOTFOUND')))
    const result = await offline.refresh()
    expect(result).toMatchObject({ ok: false, reason: 'unreachable' })
    expect(offline.current()).toEqual([MALWARE])
  })

  it('keeps the last good list when the fetched one is refused', async () => {
    const kept = watcher(serve(signedList([MALWARE]), { ...signedList([]), signature: 'AAAA' }))
    await kept.refresh()
    expect(await kept.refresh()).toMatchObject({ ok: false, reason: 'bad-signature' })
    expect(kept.current()).toEqual([MALWARE])
  })

  it('refuses an older list than the one it has', async () => {
    const newer = signedList([MALWARE], { issuedAt: '2026-11-03T12:00:00.000Z' })
    const older = signedList([], { issuedAt: '2026-11-01T12:00:00.000Z' })
    const kept = watcher(serve(newer, older))
    await kept.refresh()
    expect(await kept.refresh()).toMatchObject({ ok: false, reason: 'older' })
    expect(kept.current()).toEqual([MALWARE])
  })

  it('lifts a revocation when a newer list leaves it out', async () => {
    const onChange = vi.fn()
    const kept = watcher(serve(signedList([MALWARE]), signedList([], { issuedAt: '2026-11-04T10:00:00.000Z' })), onChange)
    await kept.refresh()
    await kept.refresh()
    expect(kept.current()).toEqual([])
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('does not trust a cache file someone edited', async () => {
    fs.writeFileSync(path.join(workDir, 'plugin-revocations.json'), JSON.stringify({ ...signedList([MALWARE]), revoked: [] }))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(watcher(serve(404)).current()).toEqual([])
  })

  it('checks ten seconds after start and every six hours after that', async () => {
    vi.useFakeTimers()
    const fetchImpl = serve(signedList([MALWARE]))
    const kept = watcher(fetchImpl)
    kept.start()
    await vi.advanceTimersByTimeAsync(FIRST_CHECK_DELAY_MS - 1)
    expect(fetchImpl).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl.mock.calls[0][0]).toBe(LIST_URL)
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    kept.stop()
  })
})

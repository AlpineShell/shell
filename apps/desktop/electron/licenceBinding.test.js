import { describe, expect, it, vi } from 'vitest'
import crypto from 'crypto'

const {
  BINDING_TIERS,
  BINDING_HASH_PATTERN,
  sha256Base64url,
  isBindClaim,
  bindingHashesMatch,
  createBindingLadder,
} = await import('./licenceBinding.js')
const { eccBlobFromPublicKey } = await import('./cngPublicKeyBlob.js')

const issuedChallenges = []

function rememberingRandomBytes(size) {
  const challenge = crypto.randomBytes(size)
  issuedChallenges.push(challenge)
  return challenge
}

function challengeBehind(digest) {
  return issuedChallenges.find((challenge) => crypto.createHash('sha256').update(challenge).digest().equals(digest)) ?? null
}

function ladderWith(providers = {}) {
  return createBindingLadder({ randomBytes: rememberingRandomBytes, ...providers })
}

function fakeTpm({ present = true, keyExists = true } = {}) {
  let keyPair = keyExists ? crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' }) : null
  const tpm = {
    available: vi.fn(() => present),
    publicBlob: vi.fn(() => (keyPair ? eccBlobFromPublicKey(keyPair.publicKey) : null)),
    createKey: vi.fn(() => {
      keyPair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
      return eccBlobFromPublicKey(keyPair.publicKey)
    }),
    sign: vi.fn((digest) => {
      const challenge = challengeBehind(digest)
      if (!keyPair || !challenge) return null
      return crypto.sign('sha256', challenge, { key: keyPair.privateKey, dsaEncoding: 'ieee-p1363' })
    }),
    deleteKey: vi.fn(() => {
      keyPair = null
      return true
    }),
    currentHash: () => (keyPair ? sha256Base64url(eccBlobFromPublicKey(keyPair.publicKey)) : null),
    loseKey: () => {
      keyPair = null
    },
  }
  return tpm
}

function fakeDpapi({ present = true, secret = null } = {}) {
  let stored = secret
  return {
    available: vi.fn(() => present),
    unseal: vi.fn(() => stored),
    seal: vi.fn(() => {
      stored = crypto.randomBytes(32)
      return stored
    }),
    discard: vi.fn(() => {
      stored = null
    }),
    currentHash: () => (stored ? sha256Base64url(stored) : null),
    loseSecret: () => {
      stored = null
    },
  }
}

function fakeMachine(hash = sha256Base64url('guid|serial|uuid')) {
  return { fingerprint: vi.fn(() => hash) }
}

describe('the bind claim shape', () => {
  const hash = sha256Base64url('anything')

  it('accepts the three tiers with a base64url sha256 hash', () => {
    for (const tier of BINDING_TIERS) expect(isBindClaim({ tier, hash })).toBe(true)
    expect(hash).toMatch(BINDING_HASH_PATTERN)
    expect(BINDING_TIERS).toEqual(['tpm', 'dpapi', 'machine'])
  })

  it('refuses unknown tiers, other hash encodings and non-objects', () => {
    expect(isBindClaim({ tier: 'cpu', hash })).toBe(false)
    expect(isBindClaim({ tier: 'tpm', hash: crypto.createHash('sha256').update('x').digest('hex') })).toBe(false)
    expect(isBindClaim({ tier: 'tpm', hash: `${hash}=` })).toBe(false)
    expect(isBindClaim({ tier: 'tpm' })).toBe(false)
    expect(isBindClaim(null)).toBe(false)
    expect(isBindClaim([hash])).toBe(false)
    expect(isBindClaim('tpm')).toBe(false)
  })
})

describe('comparing binding hashes', () => {
  it('matches equal hashes and nothing else, without throwing on lengths or types', () => {
    const hash = sha256Base64url('a')
    expect(bindingHashesMatch(hash, hash)).toBe(true)
    expect(bindingHashesMatch(hash, sha256Base64url('b'))).toBe(false)
    expect(bindingHashesMatch(hash, hash.slice(1))).toBe(false)
    expect(bindingHashesMatch(hash, null)).toBe(false)
    expect(bindingHashesMatch(undefined, hash)).toBe(false)
  })
})

describe('producing a binding at activation', () => {
  it('prefers a TPM key, proves possession with a fresh challenge and hashes the public blob', () => {
    const tpm = fakeTpm()
    const dpapi = fakeDpapi()
    const ladder = ladderWith({ tpm, dpapi, machine: fakeMachine() })
    expect(ladder.produce()).toEqual({ tier: 'tpm', hash: tpm.currentHash() })
    expect(tpm.sign).toHaveBeenCalledTimes(1)
    expect(tpm.createKey).not.toHaveBeenCalled()
    expect(dpapi.seal).not.toHaveBeenCalled()
  })

  it('creates the TPM key when none is persisted yet', () => {
    const tpm = fakeTpm({ keyExists: false })
    const ladder = ladderWith({ tpm, dpapi: fakeDpapi(), machine: fakeMachine() })
    const binding = ladder.produce()
    expect(tpm.createKey).toHaveBeenCalledTimes(1)
    expect(binding).toEqual({ tier: 'tpm', hash: tpm.currentHash() })
  })

  it('replaces a persisted key that no longer signs', () => {
    const tpm = fakeTpm()
    const stale = tpm.currentHash()
    tpm.sign.mockImplementationOnce(() => Buffer.alloc(64))
    const ladder = ladderWith({ tpm, dpapi: fakeDpapi(), machine: fakeMachine() })
    const binding = ladder.produce()
    expect(tpm.createKey).toHaveBeenCalledTimes(1)
    expect(binding.tier).toBe('tpm')
    expect(binding.hash).not.toBe(stale)
    expect(binding.hash).toBe(tpm.currentHash())
  })

  it('falls to a sealed DPAPI secret when there is no usable TPM, reusing a secret that still unseals', () => {
    const existing = crypto.randomBytes(32)
    const dpapi = fakeDpapi({ secret: existing })
    const ladder = ladderWith({ tpm: fakeTpm({ present: false }), dpapi, machine: fakeMachine() })
    expect(ladder.produce()).toEqual({ tier: 'dpapi', hash: sha256Base64url(existing) })
    expect(dpapi.seal).not.toHaveBeenCalled()
  })

  it('seals a new secret when none unseals here', () => {
    const dpapi = fakeDpapi()
    const ladder = ladderWith({ tpm: null, dpapi, machine: fakeMachine() })
    const binding = ladder.produce()
    expect(dpapi.seal).toHaveBeenCalledTimes(1)
    expect(binding).toEqual({ tier: 'dpapi', hash: dpapi.currentHash() })
  })

  it('falls to the machine fingerprint when neither the TPM nor DPAPI is usable', () => {
    const machine = fakeMachine()
    const ladder = ladderWith({ tpm: fakeTpm({ present: false }), dpapi: fakeDpapi({ present: false }), machine })
    expect(ladder.produce()).toEqual({ tier: 'machine', hash: machine.fingerprint() })
  })

  it('produces nothing when no tier works, and treats a throwing tier as unavailable', () => {
    const log = vi.fn()
    const tpm = fakeTpm()
    tpm.available.mockImplementation(() => { throw new Error('ncrypt.dll missing') })
    const ladder = ladderWith({ tpm, dpapi: fakeDpapi({ present: false }), machine: fakeMachine(null), log })
    expect(ladder.produce()).toBeNull()
    expect(log).toHaveBeenCalledWith(expect.stringContaining('ncrypt.dll missing'))
    expect(createBindingLadder({}).produce()).toBeNull()
  })

  it('never lets a TPM public blob, a sealed secret or a hardware id into the result', () => {
    const tpm = fakeTpm()
    const ladder = ladderWith({ tpm, dpapi: fakeDpapi(), machine: fakeMachine() })
    const binding = ladder.produce()
    expect(Object.keys(binding).sort()).toEqual(['hash', 'tier'])
    expect(binding.hash).toMatch(BINDING_HASH_PATTERN)
    expect(JSON.stringify(binding)).not.toContain(tpm.publicBlob().toString('base64url'))
  })
})

describe('verifying a bind claim at start', () => {
  it('holds when the TPM still holds the key behind the claimed hash and signs a fresh challenge', () => {
    const tpm = fakeTpm()
    const ladder = ladderWith({ tpm })
    expect(ladder.verify({ tier: 'tpm', hash: tpm.currentHash() })).toBe(true)
    expect(tpm.sign).toHaveBeenCalledTimes(1)
    expect(tpm.createKey).not.toHaveBeenCalled()
  })

  it('fails when the TPM key is gone, signs badly or belongs to another blob', () => {
    const tpm = fakeTpm()
    const hash = tpm.currentHash()
    const other = fakeTpm()
    expect(ladderWith({ tpm: other }).verify({ tier: 'tpm', hash })).toBe(false)
    const forged = fakeTpm()
    forged.sign.mockImplementation(() => Buffer.alloc(64))
    expect(ladderWith({ tpm: forged }).verify({ tier: 'tpm', hash: forged.currentHash() })).toBe(false)
    tpm.loseKey()
    expect(ladderWith({ tpm }).verify({ tier: 'tpm', hash })).toBe(false)
    expect(tpm.createKey).not.toHaveBeenCalled()
  })

  it('holds for a DPAPI claim only where the secret unseals to the claimed hash', () => {
    const dpapi = fakeDpapi({ secret: crypto.randomBytes(32) })
    const claim = { tier: 'dpapi', hash: dpapi.currentHash() }
    expect(ladderWith({ dpapi }).verify(claim)).toBe(true)
    expect(dpapi.seal).not.toHaveBeenCalled()
    const elsewhere = fakeDpapi({ secret: null })
    expect(ladderWith({ dpapi: elsewhere }).verify(claim)).toBe(false)
    expect(elsewhere.seal).not.toHaveBeenCalled()
  })

  it('holds for a machine claim only when all three hardware ids still hash the same', () => {
    const machine = fakeMachine()
    const claim = { tier: 'machine', hash: machine.fingerprint() }
    expect(ladderWith({ machine }).verify(claim)).toBe(true)
    expect(ladderWith({ machine: fakeMachine(sha256Base64url('guid|other-serial|uuid')) }).verify(claim)).toBe(false)
    expect(ladderWith({ machine: fakeMachine(null) }).verify(claim)).toBe(false)
  })

  it('fails a claim whose tier this build cannot reproduce, without touching any provider', () => {
    const tpm = fakeTpm()
    const ladder = ladderWith({ tpm })
    expect(ladder.verify({ tier: 'dpapi', hash: tpm.currentHash() })).toBe(false)
    expect(ladder.verify({ tier: 'cpu', hash: tpm.currentHash() })).toBe(false)
    expect(ladder.verify(null)).toBe(false)
    expect(tpm.publicBlob).not.toHaveBeenCalled()
  })

  it('treats a provider that throws as a failed proof rather than an exception', () => {
    const log = vi.fn()
    const tpm = fakeTpm()
    tpm.publicBlob.mockImplementation(() => { throw new Error('TPM busy') })
    expect(ladderWith({ tpm, log }).verify({ tier: 'tpm', hash: sha256Base64url('x') })).toBe(false)
    expect(log).toHaveBeenCalledWith(expect.stringContaining('TPM busy'))
  })

  it('remembers each verdict per claim until told to forget, so the proof runs once per start', () => {
    const tpm = fakeTpm()
    const claim = { tier: 'tpm', hash: tpm.currentHash() }
    const ladder = ladderWith({ tpm })
    expect(ladder.verify(claim)).toBe(true)
    expect(ladder.verify(claim)).toBe(true)
    expect(tpm.sign).toHaveBeenCalledTimes(1)
    ladder.forget()
    expect(ladder.verify(claim)).toBe(true)
    expect(tpm.sign).toHaveBeenCalledTimes(2)
  })
})

describe('discarding the binding material on sign-out', () => {
  it('deletes the TPM key and the sealed secret and forgets every verdict', () => {
    const tpm = fakeTpm()
    const dpapi = fakeDpapi({ secret: crypto.randomBytes(32) })
    const claim = { tier: 'tpm', hash: tpm.currentHash() }
    const ladder = ladderWith({ tpm, dpapi })
    expect(ladder.verify(claim)).toBe(true)
    ladder.discard()
    expect(tpm.deleteKey).toHaveBeenCalledTimes(1)
    expect(dpapi.discard).toHaveBeenCalledTimes(1)
    expect(ladder.verify(claim)).toBe(false)
  })

  it('survives a provider that throws while discarding', () => {
    const tpm = fakeTpm()
    tpm.deleteKey.mockImplementation(() => { throw new Error('locked') })
    const dpapi = fakeDpapi()
    expect(() => ladderWith({ tpm, dpapi }).discard()).not.toThrow()
    expect(dpapi.discard).toHaveBeenCalledTimes(1)
  })
})

import { describe, expect, it, vi } from 'vitest'
import crypto from 'crypto'
import path from 'path'

const { createBindingSecretStore, BINDING_SECRET_BYTES, BINDING_SECRET_FILE_NAME } = await import('./bindingSecretStore.js')

const USER_DATA = path.resolve(path.join(path.sep, 'alpine-test', 'userData'))
const SECRET_FILE = path.join(USER_DATA, BINDING_SECRET_FILE_NAME)

function memoryFileSystem(initialFiles = {}) {
  const files = new Map(Object.entries(initialFiles))
  return {
    files,
    readFileSync: (file) => {
      if (!files.has(file)) throw new Error(`ENOENT ${file}`)
      return files.get(file)
    },
    writeFileSync: (file, data) => {
      files.set(file, String(data))
    },
    mkdirSync: () => undefined,
    renameSync: (from, to) => {
      files.set(to, files.get(from))
      files.delete(from)
    },
    unlinkSync: (file) => {
      files.delete(file)
    },
  }
}

function fakeSafeStorage({ machine = 'this-pc', available = true } = {}) {
  const key = crypto.createHash('sha256').update(machine).digest()
  return {
    isEncryptionAvailable: () => available,
    encryptString: (plain) => {
      const iv = crypto.randomBytes(12)
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
      return Buffer.concat([iv, cipher.update(plain, 'utf8'), cipher.final(), cipher.getAuthTag()])
    },
    decryptString: (sealed) => {
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, sealed.subarray(0, 12))
      decipher.setAuthTag(sealed.subarray(sealed.length - 16))
      return Buffer.concat([decipher.update(sealed.subarray(12, sealed.length - 16)), decipher.final()]).toString('utf8')
    },
  }
}

function makeStore({ files, safeStorage = fakeSafeStorage(), fileSystem = memoryFileSystem(files) } = {}) {
  const store = createBindingSecretStore({ filePath: () => SECRET_FILE, fileSystem, safeStorage: () => safeStorage, log: () => undefined })
  return { store, fileSystem }
}

describe('the sealed binding secret', () => {
  it('seals 32 random bytes beside the licence file and unseals them again on the same PC', () => {
    const { store, fileSystem } = makeStore()
    const secret = store.seal()
    expect(secret).toHaveLength(BINDING_SECRET_BYTES)
    expect(fileSystem.files.has(SECRET_FILE)).toBe(true)
    expect(fileSystem.files.has(`${SECRET_FILE}.tmp`)).toBe(false)
    expect(store.unseal()).toEqual(secret)
  })

  it('never writes the plaintext secret to disk', () => {
    const { store, fileSystem } = makeStore()
    const secret = store.seal()
    const onDisk = fileSystem.files.get(SECRET_FILE)
    expect(onDisk).not.toContain(secret.toString('base64'))
    expect(onDisk).not.toContain(secret.toString('hex'))
    expect(Object.keys(JSON.parse(onDisk))).toEqual(['sealed'])
  })

  it('cannot be unsealed on another PC, so a copied file proves nothing there', () => {
    const here = makeStore()
    here.store.seal()
    const copied = makeStore({ fileSystem: memoryFileSystem(Object.fromEntries(here.fileSystem.files)), safeStorage: fakeSafeStorage({ machine: 'other-pc' }) })
    expect(copied.store.unseal()).toBeNull()
  })

  it('reports nothing when the file is missing, malformed or holds the wrong length', () => {
    expect(makeStore().store.unseal()).toBeNull()
    expect(makeStore({ files: { [SECRET_FILE]: '{not json' } }).store.unseal()).toBeNull()
    expect(makeStore({ files: { [SECRET_FILE]: JSON.stringify({ sealed: 12 }) } }).store.unseal()).toBeNull()
    const safeStorage = fakeSafeStorage()
    const short = safeStorage.encryptString(crypto.randomBytes(8).toString('base64')).toString('base64')
    expect(makeStore({ files: { [SECRET_FILE]: JSON.stringify({ sealed: short }) }, safeStorage }).store.unseal()).toBeNull()
  })

  it('is unavailable, and seals nothing, when Electron reports no encryption', () => {
    const { store, fileSystem } = makeStore({ safeStorage: fakeSafeStorage({ available: false }) })
    expect(store.available()).toBe(false)
    expect(store.seal()).toBeNull()
    expect(fileSystem.files.size).toBe(0)
    const throwing = { isEncryptionAvailable: () => { throw new Error('not ready') } }
    expect(makeStore({ safeStorage: throwing }).store.available()).toBe(false)
  })

  it('returns null instead of throwing when the file cannot be written', () => {
    const fileSystem = memoryFileSystem()
    fileSystem.writeFileSync = vi.fn(() => { throw new Error('EACCES') })
    const { store } = makeStore({ fileSystem })
    expect(store.seal()).toBeNull()
  })

  it('discards the file and tolerates discarding twice', () => {
    const { store, fileSystem } = makeStore()
    store.seal()
    store.discard()
    expect(fileSystem.files.has(SECRET_FILE)).toBe(false)
    expect(() => store.discard()).not.toThrow()
  })
})

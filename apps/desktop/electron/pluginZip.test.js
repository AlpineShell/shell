import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import zlib from 'zlib'
import { extractZip } from './pluginZip.js'

// Minimal ZIP writer for tests. Supports STORE (method 0) and DEFLATE (method 8).
function makeZip(entries) {
  const chunks = []
  const central = []
  let offset = 0
  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8')
    const raw = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data ?? '')
    const method = entry.method ?? 0
    const body = method === 8 ? zlib.deflateRawSync(raw) : raw

    const lfh = Buffer.alloc(30)
    lfh.writeUInt32LE(0x04034b50, 0)
    lfh.writeUInt16LE(20, 4)
    lfh.writeUInt16LE(method, 8)
    lfh.writeUInt32LE(0, 14) // crc (extractor ignores)
    lfh.writeUInt32LE(body.length, 18)
    const declaredSize = entry.declaredSize ?? raw.length
    lfh.writeUInt32LE(declaredSize, 22)
    lfh.writeUInt16LE(nameBuf.length, 26)
    const localStart = offset
    chunks.push(lfh, nameBuf, body)
    offset += 30 + nameBuf.length + body.length

    const cdh = Buffer.alloc(46)
    cdh.writeUInt32LE(0x02014b50, 0)
    cdh.writeUInt16LE(20, 4)
    cdh.writeUInt16LE(20, 6)
    cdh.writeUInt16LE(method, 10)
    cdh.writeUInt32LE(body.length, 20)
    cdh.writeUInt32LE(declaredSize, 24)
    cdh.writeUInt16LE(nameBuf.length, 28)
    cdh.writeUInt32LE(localStart, 42)
    central.push({ cdh, nameBuf })
  }
  const cdStart = offset
  let cdSize = 0
  for (const { cdh, nameBuf } of central) {
    chunks.push(cdh, nameBuf)
    cdSize += cdh.length + nameBuf.length
  }
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(central.length, 8)
  eocd.writeUInt16LE(central.length, 10)
  eocd.writeUInt32LE(cdSize, 12)
  eocd.writeUInt32LE(cdStart, 16)
  chunks.push(eocd)
  return Buffer.concat(chunks)
}

describe('extractZip', () => {
  let dir
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alpinezip-'))
  })
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('extracts STORE and DEFLATE entries, including nested paths', () => {
    const zip = makeZip([
      { name: 'plugin.json', data: '{"id":"x"}' },
      { name: 'assets/logo.txt', data: 'hello world '.repeat(20), method: 8 },
    ])
    const written = extractZip(zip, dir)
    expect(written.sort()).toEqual(['assets/logo.txt', 'plugin.json'])
    expect(fs.readFileSync(path.join(dir, 'plugin.json'), 'utf8')).toBe('{"id":"x"}')
    expect(fs.readFileSync(path.join(dir, 'assets', 'logo.txt'), 'utf8')).toBe('hello world '.repeat(20))
  })

  it('rejects a parent-directory traversal entry', () => {
    const zip = makeZip([{ name: '../escape.txt', data: 'nope' }])
    expect(() => extractZip(zip, dir)).toThrow(/unsafe|escape/i)
    expect(fs.existsSync(path.join(path.dirname(dir), 'escape.txt'))).toBe(false)
  })

  it('rejects an absolute-path entry', () => {
    const zip = makeZip([{ name: '/etc/evil', data: 'nope' }])
    expect(() => extractZip(zip, dir)).toThrow(/unsafe/i)
  })

  it('rejects a backslash traversal entry', () => {
    const zip = makeZip([{ name: '..\\win.txt', data: 'nope' }])
    expect(() => extractZip(zip, dir)).toThrow(/unsafe|escape/i)
  })

  it('throws on non-zip input', () => {
    expect(() => extractZip(Buffer.from('not a zip at all'), dir)).toThrow(/zip/i)
  })

  it('extracts an empty deflated file', () => {
    const zip = makeZip([{ name: 'empty.txt', data: '', method: 8 }])
    expect(extractZip(zip, dir)).toEqual(['empty.txt'])
    expect(fs.readFileSync(path.join(dir, 'empty.txt'), 'utf8')).toBe('')
  })

  it('stops inflating an entry at its declared size instead of expanding a bomb', () => {
    const zip = makeZip([{ name: 'bomb.bin', data: Buffer.alloc(8 * 1024 * 1024), method: 8, declaredSize: 16 }])
    expect(() => extractZip(zip, dir)).toThrow(/oversized/i)
    expect(fs.existsSync(path.join(dir, 'bomb.bin'))).toBe(false)
  })

  it('refuses an archive whose entries add up past the size limit', () => {
    const zip = makeZip([
      { name: 'a.txt', data: 'a'.repeat(60) },
      { name: 'b.txt', data: 'b'.repeat(60) },
    ])
    expect(() => extractZip(zip, dir, { maxEntries: 10, maxTotalBytes: 100 })).toThrow(/beyond 100 bytes/)
    expect(fs.existsSync(path.join(dir, 'b.txt'))).toBe(false)
  })

  it('refuses an archive with too many entries before writing anything', () => {
    const zip = makeZip([
      { name: 'a.txt', data: 'a' },
      { name: 'b.txt', data: 'b' },
      { name: 'c.txt', data: 'c' },
    ])
    expect(() => extractZip(zip, dir, { maxEntries: 2, maxTotalBytes: 100 })).toThrow(/more than 2 entries/)
    expect(fs.readdirSync(dir)).toEqual([])
  })
})

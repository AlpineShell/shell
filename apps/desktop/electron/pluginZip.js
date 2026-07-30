const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const EOCD_SIG = 0x06054b50
const CDH_SIG = 0x02014b50
const LFH_SIG = 0x04034b50

function findEOCD(buf) {
  const min = 22
  if (buf.length < min) return -1
  const from = buf.length - min
  const to = Math.max(0, buf.length - (min + 0xffff))
  for (let i = from; i >= to; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i
  }
  return -1
}

function safeEntryName(name) {
  if (typeof name !== 'string' || name.length === 0) return null
  if (name.includes('\0')) return null
  const norm = name.replace(/\\/g, '/')
  if (norm.startsWith('/')) return null
  if (/^[a-zA-Z]:/.test(norm)) return null
  if (norm.split('/').some((seg) => seg === '..')) return null
  return norm
}

function extractZip(buffer, destDir) {
  if (!Buffer.isBuffer(buffer)) throw new Error('extractZip: buffer required')
  const eocd = findEOCD(buffer)
  if (eocd === -1) throw new Error('Not a zip file (no end-of-central-directory record)')

  const totalEntries = buffer.readUInt16LE(eocd + 10)
  const cdSize = buffer.readUInt32LE(eocd + 12)
  const cdOffset = buffer.readUInt32LE(eocd + 16)
  if (totalEntries === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    throw new Error('zip64 archives are not supported')
  }
  if (cdOffset + cdSize > buffer.length) throw new Error('Corrupt zip (central directory out of range)')

  const realDest = fs.realpathSync(destDir)
  const written = []
  let ptr = cdOffset

  for (let i = 0; i < totalEntries; i++) {
    if (ptr + 46 > buffer.length || buffer.readUInt32LE(ptr) !== CDH_SIG) {
      throw new Error('Corrupt zip (bad central directory header)')
    }
    const method = buffer.readUInt16LE(ptr + 10)
    const compSize = buffer.readUInt32LE(ptr + 20)
    const uncompSize = buffer.readUInt32LE(ptr + 24)
    const nameLen = buffer.readUInt16LE(ptr + 28)
    const extraLen = buffer.readUInt16LE(ptr + 30)
    const commentLen = buffer.readUInt16LE(ptr + 32)
    const localOffset = buffer.readUInt32LE(ptr + 42)
    const rawName = buffer.toString('utf8', ptr + 46, ptr + 46 + nameLen)
    ptr += 46 + nameLen + extraLen + commentLen

    if (compSize === 0xffffffff || uncompSize === 0xffffffff || localOffset === 0xffffffff) {
      throw new Error('zip64 entries are not supported')
    }

    const isDir = rawName.endsWith('/')
    const safe = safeEntryName(rawName)
    if (safe === null) throw new Error(`Unsafe zip entry name: ${rawName}`)

    const resolved = path.resolve(realDest, safe)
    if (resolved !== realDest && !resolved.startsWith(realDest + path.sep)) {
      throw new Error(`Zip entry escapes target directory: ${rawName}`)
    }

    if (isDir) {
      fs.mkdirSync(resolved, { recursive: true })
      continue
    }

    if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== LFH_SIG) {
      throw new Error('Corrupt zip (bad local file header)')
    }
    const lNameLen = buffer.readUInt16LE(localOffset + 26)
    const lExtraLen = buffer.readUInt16LE(localOffset + 28)
    const dataStart = localOffset + 30 + lNameLen + lExtraLen
    const dataEnd = dataStart + compSize
    if (dataEnd > buffer.length) throw new Error('Corrupt zip (entry data out of range)')
    const comp = buffer.subarray(dataStart, dataEnd)

    let data
    if (method === 0) {
      data = comp
    } else if (method === 8) {
      data = zlib.inflateRawSync(comp)
    } else {
      throw new Error(`Unsupported compression method ${method} for ${rawName}`)
    }
    if (data.length !== uncompSize) throw new Error(`Size mismatch for ${rawName}`)

    fs.mkdirSync(path.dirname(resolved), { recursive: true })
    fs.writeFileSync(resolved, data)
    written.push(safe)
  }

  return written
}

module.exports = { extractZip }

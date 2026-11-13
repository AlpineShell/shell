const zlib = require('node:zlib')

const LOCAL_HEADER_SIGNATURE = 0x04034b50
const CENTRAL_HEADER_SIGNATURE = 0x02014b50
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50
const ZIP_VERSION = 20
const UTF8_NAMES_FLAG = 0x0800
const STORE = 0
const DEFLATE = 8
const DOS_TIME_MIDNIGHT = 0
const DOS_DATE_1980_01_01 = (1 << 5) | 1
const MAX_ENTRIES = 0xffff
const MAX_OFFSET = 0xffffffff

function compressEntry(data) {
  const deflated = zlib.deflateRawSync(data, { level: 9 })
  return deflated.length < data.length ? { method: DEFLATE, body: deflated } : { method: STORE, body: data }
}

function localHeader(entry) {
  const header = Buffer.alloc(30)
  header.writeUInt32LE(LOCAL_HEADER_SIGNATURE, 0)
  header.writeUInt16LE(ZIP_VERSION, 4)
  header.writeUInt16LE(UTF8_NAMES_FLAG, 6)
  header.writeUInt16LE(entry.method, 8)
  header.writeUInt16LE(DOS_TIME_MIDNIGHT, 10)
  header.writeUInt16LE(DOS_DATE_1980_01_01, 12)
  header.writeUInt32LE(entry.crc, 14)
  header.writeUInt32LE(entry.body.length, 18)
  header.writeUInt32LE(entry.size, 22)
  header.writeUInt16LE(entry.name.length, 26)
  header.writeUInt16LE(0, 28)
  return header
}

function centralHeader(entry) {
  const header = Buffer.alloc(46)
  header.writeUInt32LE(CENTRAL_HEADER_SIGNATURE, 0)
  header.writeUInt16LE(ZIP_VERSION, 4)
  header.writeUInt16LE(ZIP_VERSION, 6)
  header.writeUInt16LE(UTF8_NAMES_FLAG, 8)
  header.writeUInt16LE(entry.method, 10)
  header.writeUInt16LE(DOS_TIME_MIDNIGHT, 12)
  header.writeUInt16LE(DOS_DATE_1980_01_01, 14)
  header.writeUInt32LE(entry.crc, 16)
  header.writeUInt32LE(entry.body.length, 20)
  header.writeUInt32LE(entry.size, 24)
  header.writeUInt16LE(entry.name.length, 28)
  header.writeUInt32LE(entry.offset, 42)
  return header
}

function endOfCentralDirectory(entryCount, directorySize, directoryOffset) {
  const record = Buffer.alloc(22)
  record.writeUInt32LE(END_OF_CENTRAL_DIRECTORY_SIGNATURE, 0)
  record.writeUInt16LE(entryCount, 8)
  record.writeUInt16LE(entryCount, 10)
  record.writeUInt32LE(directorySize, 12)
  record.writeUInt32LE(directoryOffset, 16)
  return record
}

function createZipArchive(files) {
  if (files.length > MAX_ENTRIES) throw new Error(`A bundle holds at most ${MAX_ENTRIES} files`)
  const chunks = []
  const entries = []
  let offset = 0
  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8')
    const { method, body } = compressEntry(file.data)
    const entry = { name, method, body, crc: zlib.crc32(file.data), size: file.data.length, offset }
    const header = localHeader(entry)
    chunks.push(header, name, body)
    offset += header.length + name.length + body.length
    entries.push(entry)
  }
  const directoryOffset = offset
  for (const entry of entries) {
    const header = centralHeader(entry)
    chunks.push(header, entry.name)
    offset += header.length + entry.name.length
  }
  if (offset > MAX_OFFSET) throw new Error('A bundle must stay below 4 GB')
  chunks.push(endOfCentralDirectory(entries.length, offset - directoryOffset, directoryOffset))
  return Buffer.concat(chunks)
}

module.exports = { createZipArchive }

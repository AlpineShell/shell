const crypto = require('crypto')
const koffi = require('koffi')
const { addEntry, removeEntry, findEntry, isWorthKeeping, summarizeEntries } = require('./clipboardHistoryList')

const user32 = koffi.load('user32.dll')
const kernel32 = koffi.load('kernel32.dll')

const GetClipboardSequenceNumber = user32.func('__stdcall', 'GetClipboardSequenceNumber', 'uint32', [])
const RegisterClipboardFormatW = user32.func('__stdcall', 'RegisterClipboardFormatW', 'uint32', ['str16'])
const IsClipboardFormatAvailable = user32.func('__stdcall', 'IsClipboardFormatAvailable', 'int', ['uint32'])
const OpenClipboard = user32.func('__stdcall', 'OpenClipboard', 'int', ['uintptr_t'])
const CloseClipboard = user32.func('__stdcall', 'CloseClipboard', 'int', [])
const GetClipboardData = user32.func('__stdcall', 'GetClipboardData', 'uintptr_t', ['uint32'])
const GlobalLock = kernel32.func('__stdcall', 'GlobalLock', 'void *', ['uintptr_t'])
const GlobalUnlock = kernel32.func('__stdcall', 'GlobalUnlock', 'int', ['uintptr_t'])
const GlobalSize = kernel32.func('__stdcall', 'GlobalSize', 'size_t', ['uintptr_t'])

const POLL_INTERVAL_MS = 500
const THUMBNAIL_HEIGHT = 96
const MAX_IMAGE_PNG_BYTES = 8 * 1024 * 1024
const DWORD_BYTES = 4
const PRIVATE_FORMAT_NAMES = ['ExcludeClipboardContentFromMonitorProcessing', 'Clipboard Viewer Ignore']
const HISTORY_PERMISSION_FORMAT_NAME = 'CanIncludeInClipboardHistory'
const TEXT_TYPE = 'text/plain'
const HTML_TYPE = 'text/html'
const PNG_TYPE = 'image/png'
const CHANGED_CHANNEL = 'clipboard/history-changed'

let entries = []
let nextId = 1
let lastSequence = 0
let reading = false
let privateFormatIds = []
let historyPermissionFormatId = 0
let broadcast = null

function electron() {
  return require('electron')
}

function hashOf(data) {
  return crypto.createHash('sha1').update(data).digest('hex')
}

function readClipboardDword(formatId) {
  if (!formatId || !IsClipboardFormatAvailable(formatId) || !OpenClipboard(0)) return null
  try {
    const handle = GetClipboardData(formatId)
    if (!handle || Number(GlobalSize(handle)) < DWORD_BYTES) return null
    const pointer = GlobalLock(handle)
    if (!pointer) return null
    try {
      return koffi.decode(pointer, 'uint32')
    } finally {
      GlobalUnlock(handle)
    }
  } finally {
    CloseClipboard()
  }
}

function isMarkedPrivate() {
  if (privateFormatIds.some((formatId) => IsClipboardFormatAvailable(formatId))) return true
  return readClipboardDword(historyPermissionFormatId) === 0
}

async function readTypeAsText(item, type) {
  return item.types.includes(type) ? (await item.getType(type)).text() : ''
}

async function readTextContent(item) {
  const text = await readTypeAsText(item, TEXT_TYPE)
  if (!isWorthKeeping(text)) return null
  return { kind: 'text', contentKey: text, text, html: await readTypeAsText(item, HTML_TYPE) }
}

async function readImageContent(item) {
  if (!item.types.includes(PNG_TYPE)) return null
  const png = Buffer.from(await (await item.getType(PNG_TYPE)).arrayBuffer())
  if (png.length === 0 || png.length > MAX_IMAGE_PNG_BYTES) return null
  const image = electron().nativeImage.createFromBuffer(png)
  if (image.isEmpty()) return null
  const { width, height } = image.getSize()
  const thumbnail = image.resize({ height: Math.min(THUMBNAIL_HEIGHT, height) }).toDataURL()
  return { kind: 'image', contentKey: hashOf(image.toBitmap()), png, thumbnail, width, height }
}

async function readClipboardEntry() {
  const [item] = await electron().clipboard.read()
  if (!item) return null
  const content = (await readTextContent(item)) ?? (await readImageContent(item))
  if (!content) return null
  return { ...content, id: String(nextId++), copiedAt: Date.now() }
}

function publish() {
  if (broadcast) broadcast(CHANGED_CHANNEL, summarizeEntries(entries))
}

async function recordClipboardChange() {
  const sequence = GetClipboardSequenceNumber()
  if (reading || sequence === lastSequence) return
  lastSequence = sequence
  reading = true
  try {
    if (isMarkedPrivate()) return
    const entry = await readClipboardEntry()
    if (!entry) return
    entries = addEntry(entries, entry)
    publish()
  } catch (e) {
    console.error('[clipboardHistory] read error:', e.message)
  } finally {
    reading = false
  }
}

function clipboardItemFor(entry) {
  const { ClipboardItem } = electron()
  if (entry.kind === 'image') return new ClipboardItem({ [PNG_TYPE]: new Blob([entry.png], { type: PNG_TYPE }) })
  return new ClipboardItem(entry.html ? { [TEXT_TYPE]: entry.text, [HTML_TYPE]: entry.html } : { [TEXT_TYPE]: entry.text })
}

async function restore(id) {
  const entry = findEntry(entries, id)
  if (!entry) return { ok: false }
  try {
    await electron().clipboard.write([clipboardItemFor(entry)])
    return { ok: true }
  } catch (e) {
    console.error('[clipboardHistory] restore error:', e.message)
    return { ok: false }
  }
}

function remove(id) {
  entries = removeEntry(entries, id)
  publish()
  return summarizeEntries(entries)
}

function clear() {
  entries = []
  publish()
  return []
}

module.exports = {
  handlers: {
    'clipboard/history-get': () => summarizeEntries(entries),
    'clipboard/history-restore': (_event, id) => restore(id),
    'clipboard/history-remove': (_event, id) => remove(id),
    'clipboard/history-clear': () => clear(),
  },
  start(broadcastToWindows) {
    broadcast = broadcastToWindows
    privateFormatIds = PRIVATE_FORMAT_NAMES.map((name) => RegisterClipboardFormatW(name)).filter(Boolean)
    historyPermissionFormatId = RegisterClipboardFormatW(HISTORY_PERMISSION_FORMAT_NAME)
    recordClipboardChange()
    setInterval(recordClipboardChange, POLL_INTERVAL_MS)
  },
}

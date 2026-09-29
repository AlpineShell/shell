const OFF64 = { hWnd: 8, uID: 16, uFlags: 20, uCallback: 24, hIcon: 32, szTip: 40, szInfo: 304, uVersion: 816, szInfoTitle: 820, dwInfoFlags: 948, guid: 952 }
const OFF32 = { hWnd: 4, uID: 8, uFlags: 12, uCallback: 16, hIcon: 20, szTip: 24, szInfo: 288, uVersion: 800, szInfoTitle: 804, dwInfoFlags: 932, guid: 936 }

const INFO_CHARS = 256
const INFO_TITLE_CHARS = 64
const INFO_FLAGS_BYTES = 4
const NIIF_ERROR = 0x03
const NIIF_ICON_MASK = 0x0f
const NIN_BALLOONSHOW = 0x0402
const NIN_BALLOONHIDE = 0x0403
const NIN_BALLOONTIMEOUT = 0x0404
const NIN_BALLOONUSERCLICK = 0x0405
const BALLOON_NOTICE_PREFIX = 'tray-balloon:'
const ENDS_WITH_PUNCTUATION = /[.!?:]$/

function readWideString(buf, off, maxChars) {
  const end = Math.min(buf.length, off + maxChars * 2)
  let s = ''
  for (let at = off; at + 2 <= end; at += 2) {
    const c = buf.readUInt16LE(at)
    if (c === 0) break
    s += String.fromCharCode(c)
  }
  return s
}

function readBalloon(buf, base, offsets) {
  if (buf.length < base + offsets.dwInfoFlags + INFO_FLAGS_BYTES) return null
  return {
    title: readWideString(buf, base + offsets.szInfoTitle, INFO_TITLE_CHARS).trim(),
    message: readWideString(buf, base + offsets.szInfo, INFO_CHARS).trim(),
    isError: (buf.readUInt32LE(base + offsets.dwInfoFlags) & NIIF_ICON_MASK) === NIIF_ERROR,
  }
}

function balloonNoticeId(iconId) {
  return `${BALLOON_NOTICE_PREFIX}${iconId}`
}

function firstLine(text) {
  return typeof text === 'string' ? text.split(/\r?\n/)[0].trim() : ''
}

function balloonSourceName(source) {
  if (!source) return null
  return firstLine(source.tooltip) || source.exeName || null
}

function balloonText(balloon, sourceName) {
  const { title, message } = balloon
  if (!title || (sourceName && title.toLowerCase() === sourceName.toLowerCase())) return message
  return ENDS_WITH_PUNCTUATION.test(title) ? `${title} ${message}` : `${title}: ${message}`
}

function balloonClosedMessage(reason) {
  if (reason === 'timeout' || reason === 'dismissed') return NIN_BALLOONTIMEOUT
  if (reason === 'withdrawn' || reason === 'replaced') return NIN_BALLOONHIDE
  return null
}

function tellAppBalloonClosed(postToApp, reason) {
  const message = balloonClosedMessage(reason)
  if (message) postToApp(message)
}

function balloonNotice(iconId, balloon, source, postToApp) {
  const canTellApp = typeof postToApp === 'function'
  const sourceName = balloonSourceName(source)
  return {
    id: balloonNoticeId(iconId),
    title: sourceName,
    message: balloonText(balloon, sourceName),
    tone: balloon.isError ? 'error' : 'info',
    action: canTellApp ? { label: 'Open', run: () => postToApp(NIN_BALLOONUSERCLICK) } : null,
    onShown: canTellApp ? () => postToApp(NIN_BALLOONSHOW) : null,
    onClose: canTellApp ? (reason) => tellAppBalloonClosed(postToApp, reason) : null,
    waitForTurn: true,
  }
}

module.exports = {
  OFF64,
  OFF32,
  NIN_BALLOONSHOW,
  NIN_BALLOONHIDE,
  NIN_BALLOONTIMEOUT,
  NIN_BALLOONUSERCLICK,
  readWideString,
  readBalloon,
  balloonNoticeId,
  balloonClosedMessage,
  balloonNotice,
}

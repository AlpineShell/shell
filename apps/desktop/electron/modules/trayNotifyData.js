const OFF64 = { hWnd: 8, uID: 16, uFlags: 20, uCallback: 24, hIcon: 32, szTip: 40, szInfo: 304, uVersion: 816, szInfoTitle: 820, dwInfoFlags: 948, guid: 952 }
const OFF32 = { hWnd: 4, uID: 8, uFlags: 12, uCallback: 16, hIcon: 20, szTip: 24, szInfo: 288, uVersion: 800, szInfoTitle: 804, dwInfoFlags: 932, guid: 936 }

const INFO_CHARS = 256
const INFO_TITLE_CHARS = 64
const INFO_FLAGS_BYTES = 4
const NIIF_ERROR = 0x03
const NIIF_ICON_MASK = 0x0f
const BALLOON_NOTICE_PREFIX = 'tray-balloon:'

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

function balloonNotice(iconId, balloon, tooltip, open) {
  return {
    id: balloonNoticeId(iconId),
    title: balloon.title || firstLine(tooltip) || null,
    message: balloon.message,
    tone: balloon.isError ? 'error' : 'info',
    action: typeof open === 'function' ? { label: 'Open', run: open } : null,
    waitForTurn: true,
  }
}

module.exports = {
  OFF64,
  OFF32,
  readWideString,
  readBalloon,
  balloonNoticeId,
  balloonNotice,
}

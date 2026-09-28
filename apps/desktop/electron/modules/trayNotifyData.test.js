import { describe, it, expect, vi } from 'vitest'
import trayNotifyData from './trayNotifyData.js'

const { OFF64, OFF32, readWideString, readBalloon, balloonNoticeId, balloonNotice } = trayNotifyData

const TRAY_HEADER_BYTES = 8
const NIIF_INFO = 0x01
const NIIF_WARNING = 0x02
const NIIF_ERROR = 0x03
const NIIF_USER = 0x04
const NIIF_NOSOUND = 0x10

function notifyIconDataLayout(handleBytes) {
  const fields = [
    ['cbSize', 4, 4],
    ['hWnd', handleBytes, handleBytes],
    ['uID', 4, 4],
    ['uFlags', 4, 4],
    ['uCallback', 4, 4],
    ['hIcon', handleBytes, handleBytes],
    ['szTip', 128 * 2, 2],
    ['dwState', 4, 4],
    ['dwStateMask', 4, 4],
    ['szInfo', 256 * 2, 2],
    ['uVersion', 4, 4],
    ['szInfoTitle', 64 * 2, 2],
    ['dwInfoFlags', 4, 4],
    ['guid', 16, 4],
    ['hBalloonIcon', handleBytes, handleBytes],
  ]
  const offsets = {}
  let end = 0
  for (const [name, size, alignment] of fields) {
    const start = Math.ceil(end / alignment) * alignment
    offsets[name] = start
    end = start + size
  }
  return { offsets, size: Math.ceil(end / handleBytes) * handleBytes }
}

function trayMessage(handleBytes, { infoTitle = '', info = '', infoFlags = NIIF_INFO, trailing = 0 } = {}) {
  const { offsets, size } = notifyIconDataLayout(handleBytes)
  const buf = Buffer.alloc(TRAY_HEADER_BYTES + size)
  buf.write(infoTitle, TRAY_HEADER_BYTES + offsets.szInfoTitle, 'utf16le')
  buf.write(info, TRAY_HEADER_BYTES + offsets.szInfo, 'utf16le')
  buf.writeUInt32LE(infoFlags, TRAY_HEADER_BYTES + offsets.dwInfoFlags)
  buf.writeUInt32LE(trailing, TRAY_HEADER_BYTES + offsets.uVersion)
  return buf
}

function pick(source, keys) {
  return Object.fromEntries(keys.map((key) => [key, source[key]]))
}

describe('the NOTIFYICONDATAW offsets', () => {
  it('match the 64-bit layout with pointer-sized handles', () => {
    expect(OFF64).toEqual(pick(notifyIconDataLayout(8).offsets, Object.keys(OFF64)))
  })

  it('match the 32-bit layout the shell forwards from 32-bit handles', () => {
    expect(OFF32).toEqual(pick(notifyIconDataLayout(4).offsets, Object.keys(OFF32)))
  })
})

describe('readBalloon', () => {
  it.each([
    ['64-bit', 8, OFF64],
    ['32-bit', 4, OFF32],
  ])('reads the title, the text and the icon of a %s balloon', (_label, handleBytes, offsets) => {
    const buf = trayMessage(handleBytes, { infoTitle: 'Threat found', info: 'A file was quarantined.', infoFlags: NIIF_ERROR })
    expect(readBalloon(buf, TRAY_HEADER_BYTES, offsets)).toEqual({ title: 'Threat found', message: 'A file was quarantined.', isError: true })
  })

  it('treats only the error icon as an error, whatever other flags ride along', () => {
    const toneFor = (infoFlags) => readBalloon(trayMessage(8, { info: 'x', infoFlags }), TRAY_HEADER_BYTES, OFF64).isError
    expect(toneFor(NIIF_ERROR | NIIF_NOSOUND)).toBe(true)
    expect(toneFor(NIIF_WARNING)).toBe(false)
    expect(toneFor(NIIF_USER)).toBe(false)
    expect(toneFor(NIIF_INFO)).toBe(false)
  })

  it('reads an empty text, which asks for the balloon to be removed', () => {
    expect(readBalloon(trayMessage(8), TRAY_HEADER_BYTES, OFF64)).toMatchObject({ title: '', message: '' })
  })

  it('trims whitespace an app pads its text with', () => {
    const buf = trayMessage(8, { infoTitle: '  Backup ', info: 'Done.\r\n' })
    expect(readBalloon(buf, TRAY_HEADER_BYTES, OFF64)).toMatchObject({ title: 'Backup', message: 'Done.' })
  })

  it('stops a text with no terminator at the end of its field', () => {
    const buf = trayMessage(8, { info: 'a'.repeat(256), trailing: 0x00420041 })
    expect(readBalloon(buf, TRAY_HEADER_BYTES, OFF64).message).toBe('a'.repeat(256))
  })

  it('reads nothing from a message too short to carry a balloon', () => {
    const buf = trayMessage(8, { info: 'x' }).subarray(0, TRAY_HEADER_BYTES + OFF64.dwInfoFlags + 3)
    expect(readBalloon(buf, TRAY_HEADER_BYTES, OFF64)).toBeNull()
  })
})

describe('readWideString', () => {
  it('never reads past the end of the buffer', () => {
    const buf = Buffer.from('abc', 'utf16le')
    expect(readWideString(buf, 0, 128)).toBe('abc')
    expect(readWideString(buf, 4, 128)).toBe('c')
    expect(readWideString(buf, 10, 128)).toBe('')
  })

  it('stops at the terminator', () => {
    expect(readWideString(Buffer.from('ab\0cd', 'utf16le'), 0, 5)).toBe('ab')
  })
})

describe('balloonNotice', () => {
  const balloon = { title: 'Sync paused', message: 'Reconnect to resume.', isError: false }

  it('carries the balloon as a notice that waits for its turn', () => {
    expect(balloonNotice('app:dropbox.exe:1', balloon, 'Dropbox', null)).toEqual({
      id: balloonNoticeId('app:dropbox.exe:1'),
      title: 'Sync paused',
      message: 'Reconnect to resume.',
      tone: 'info',
      action: null,
      waitForTurn: true,
    })
  })

  it('names the app from its tooltip when the balloon has no title', () => {
    const request = balloonNotice('guid:1', { ...balloon, title: '' }, 'Backup Agent\r\nLast run: today', null)
    expect(request.title).toBe('Backup Agent')
  })

  it('has no title when neither the balloon nor the tooltip gives one', () => {
    expect(balloonNotice('guid:1', { ...balloon, title: '' }, '', null).title).toBeNull()
  })

  it('shows an error balloon as an error', () => {
    expect(balloonNotice('guid:1', { ...balloon, isError: true }, '', null).tone).toBe('error')
  })

  it('offers Open only when the app can be told the balloon was clicked', () => {
    const open = vi.fn()
    const request = balloonNotice('guid:1', balloon, '', open)
    expect(request.action.label).toBe('Open')
    request.action.run()
    expect(open).toHaveBeenCalledTimes(1)
  })

  it('keeps one notice id per tray icon', () => {
    expect(balloonNoticeId('guid:1')).toBe(balloonNoticeId('guid:1'))
    expect(balloonNoticeId('guid:1')).not.toBe(balloonNoticeId('guid:2'))
  })
})

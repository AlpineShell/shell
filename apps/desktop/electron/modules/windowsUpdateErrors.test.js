import { describe, it, expect } from 'vitest'
import { hresultFromText, windowsUpdateErrorMessage, searchFailureMessage } from './windowsUpdateErrors.js'

const NO_CONNECTION = "Windows Update couldn't reach Microsoft. Check your internet connection and try again."

describe('hresultFromText', () => {
  it('reads the first HRESULT in the text', () => {
    expect(hresultFromText('0x8024402C\r\n')).toBe(0x8024402c)
    expect(hresultFromText('Exception from HRESULT: 0x80072EE2 (more)')).toBe(0x80072ee2)
  })

  it('returns null when there is none', () => {
    expect(hresultFromText('')).toBeNull()
    expect(hresultFromText(undefined)).toBeNull()
    expect(hresultFromText('Command failed: powershell -NoProfile')).toBeNull()
  })
})

describe('windowsUpdateErrorMessage', () => {
  it.each([0x8024402c, 0x80244022, 0x80072ee2, 0x80072efd, 0x80072f8f, 0x8024500c, 0x8024001f, 0x80240438])(
    'explains the transport failure %s as a lost connection',
    (code) => {
      expect(windowsUpdateErrorMessage(code)).toBe(NO_CONNECTION)
    }
  )

  it('names a disabled service', () => {
    expect(windowsUpdateErrorMessage(0x80070422)).toBe('The Windows Update service is turned off.')
  })

  it('names another update already running', () => {
    expect(windowsUpdateErrorMessage(0x80240016)).toMatch(/busy/)
  })

  it('names an interrupted operation', () => {
    expect(windowsUpdateErrorMessage(0x8024001e)).toMatch(/stopped before it finished/)
    expect(windowsUpdateErrorMessage(0x8024000b)).toMatch(/stopped before it finished/)
  })

  it('shows the code of an unknown failure', () => {
    expect(windowsUpdateErrorMessage(0x80070005)).toBe('Windows Update ran into a problem (0x80070005). Try again.')
  })

  it('falls back to a plain sentence without a code', () => {
    expect(windowsUpdateErrorMessage(null)).toBe('Windows Update ran into a problem. Try again.')
  })
})

describe('searchFailureMessage', () => {
  it('reports a search that ran out of time', () => {
    expect(searchFailureMessage({ timedOut: true, stderr: '' })).toBe('Windows Update took too long to answer. Try again.')
  })

  it('never repeats the command line', () => {
    const message = searchFailureMessage({ timedOut: false, stderr: '0x8024402C\r\n' })
    expect(message).toBe(NO_CONNECTION)
    expect(message).not.toMatch(/powershell|Command failed/i)
  })
})

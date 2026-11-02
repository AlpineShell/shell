const HRESULT_PATTERN = /0x[0-9a-f]{8}/i

const NO_CONNECTION_MESSAGE = "Windows Update couldn't reach Microsoft. Check your internet connection and try again."
const SERVICE_DISABLED_MESSAGE = 'The Windows Update service is turned off.'
const BUSY_MESSAGE = 'Windows Update is busy with another update. Try again in a few minutes.'
const INTERRUPTED_MESSAGE = 'Windows Update stopped before it finished. Try again.'
const TIMED_OUT_MESSAGE = 'Windows Update took too long to answer. Try again.'
const UNKNOWN_FAILURE_MESSAGE = 'Windows Update ran into a problem. Try again.'

const MESSAGES_BY_HRESULT = {
  0x8024001f: NO_CONNECTION_MESSAGE,
  0x80240438: NO_CONNECTION_MESSAGE,
  0x80070422: SERVICE_DISABLED_MESSAGE,
  0x80240016: BUSY_MESSAGE,
  0x8024000b: INTERRUPTED_MESSAGE,
  0x8024001e: INTERRUPTED_MESSAGE,
}

function isTransportFailure(code) {
  const isWinHttpOrWinInet = code >= 0x80072ee0 && code <= 0x80072fff
  const isWindowsUpdateProtocolTransport = code >= 0x80244000 && code <= 0x80244fff
  const isWindowsUpdateRedirector = code >= 0x80245000 && code <= 0x80245fff
  return isWinHttpOrWinInet || isWindowsUpdateProtocolTransport || isWindowsUpdateRedirector
}

function hresultFromText(text) {
  const match = HRESULT_PATTERN.exec(String(text ?? ''))
  return match ? parseInt(match[0], 16) : null
}

function formatHresult(code) {
  return `0x${code.toString(16).toUpperCase().padStart(8, '0')}`
}

function windowsUpdateErrorMessage(hresult) {
  if (hresult == null) return UNKNOWN_FAILURE_MESSAGE
  if (MESSAGES_BY_HRESULT[hresult]) return MESSAGES_BY_HRESULT[hresult]
  if (isTransportFailure(hresult)) return NO_CONNECTION_MESSAGE
  return `Windows Update ran into a problem (${formatHresult(hresult)}). Try again.`
}

function searchFailureMessage({ timedOut, stderr }) {
  if (timedOut) return TIMED_OUT_MESSAGE
  return windowsUpdateErrorMessage(hresultFromText(stderr))
}

module.exports = { hresultFromText, windowsUpdateErrorMessage, searchFailureMessage }

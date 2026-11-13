const RADIO_STATES = new Set(['on', 'off', 'unavailable', 'unknown'])
const { toWifiNetworks } = require('./wifiOperations')

function initialWifiState() {
  return {
    radio: 'unknown',
    networks: [],
    scanning: false,
    operation: null,
    lastError: null,
    ethernet: false,
    offForEthernet: false,
    blockedByEthernet: false,
  }
}

function normalizeRadioState(radio) {
  return RADIO_STATES.has(radio) ? radio : 'unknown'
}

function settleRadioTarget({ target, deadline, observed, now }) {
  if (target === null) return { shown: observed, target: null }
  if (observed === target || now >= deadline) return { shown: observed, target: null }
  return { shown: target, target }
}

function radioOffForEthernet({ previous, wiredConnected, previousRadio, radio, requestedRadio }) {
  if (!wiredConnected) return false
  if (radio === 'on') return false
  if (previousRadio === 'on' && radio === 'off' && requestedRadio !== 'off') return true
  return previous
}

function wifiLinkFor(connection) {
  if (!connection?.connected) return { connected: false, ssid: null, signal: null }
  return {
    connected: true,
    ssid: connection.ssid ?? null,
    signal: connection.signal ?? null,
  }
}

function networkStatusFor(wiredConnected, connection) {
  const wifi = wifiLinkFor(connection)
  if (wiredConnected) {
    return { signal: null, connected: true, type: 'ethernet', ssid: null, wifi }
  }
  return {
    signal: wifi.signal,
    connected: wifi.connected,
    type: 'wifi',
    ssid: wifi.ssid,
    wifi,
  }
}

function jsonChanged(previousValue, nextValue) {
  return JSON.stringify(previousValue) !== JSON.stringify(nextValue)
}

function connectionKey(status) {
  return `${status.connected}:${status.type}:${status.ssid}:${status.wifi.ssid}`
}

function networksAfterRead({ rawNetworks, radio, previousNetworks, previousNullWhileOn }) {
  if (Array.isArray(rawNetworks)) {
    return { networks: toWifiNetworks(rawNetworks), previousNullWhileOn: false }
  }
  if (radio === 'on' && !previousNullWhileOn) {
    return { networks: previousNetworks, previousNullWhileOn: true }
  }
  return { networks: [], previousNullWhileOn: false }
}

function parseRadioScriptResult(output) {
  if (!output) return { success: false, state: 'unknown' }
  try {
    const result = JSON.parse(output)
    return {
      success: result?.success === true,
      state: normalizeRadioState(result?.state),
    }
  } catch {
    return { success: false, state: 'unknown' }
  }
}

module.exports = {
  connectionKey,
  initialWifiState,
  jsonChanged,
  networkStatusFor,
  networksAfterRead,
  normalizeRadioState,
  parseRadioScriptResult,
  radioOffForEthernet,
  settleRadioTarget,
  wifiLinkFor,
}

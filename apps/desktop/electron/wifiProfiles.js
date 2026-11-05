const XML_ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }

function escapeXml(text) {
  return text.replace(/[&<>"']/g, (character) => XML_ENTITIES[character])
}

function ssidHex(ssid) {
  return Buffer.from(ssid, 'utf8').toString('hex').toUpperCase()
}

function isValidPassphrase(password) {
  if (typeof password !== 'string') return false
  return (password.length >= 8 && password.length <= 63) || /^[\da-fA-F]{64}$/.test(password)
}

function authenticationFor(security) {
  if (security === 'wpa-personal') return 'WPAPSK'
  if (security === 'wpa2-personal') return 'WPA2PSK'
  if (security === 'wpa3-personal') return 'WPA3SAE'
  return null
}

function authEncryptionFor(security, cipherAlgorithm) {
  if (security === 'open') return { authentication: 'open', encryption: 'none' }
  if (security === 'owe') return { authentication: 'OWE', encryption: 'AES' }
  const authentication = authenticationFor(security)
  if (!authentication) throw new Error('Unsupported Wi-Fi security')
  return { authentication, encryption: cipherAlgorithm === 2 ? 'TKIP' : 'AES' }
}

function sharedKeyXml(password) {
  if (typeof password !== 'string' || password.length === 0) return ''
  const keyType = /^[\da-fA-F]{64}$/.test(password) ? 'networkKey' : 'passPhrase'
  return `<sharedKey><keyType>${keyType}</keyType><protected>false</protected><keyMaterial>${escapeXml(password)}</keyMaterial></sharedKey>`
}

function buildProfileXml({ ssid, security, cipherAlgorithm, password }) {
  const escapedSsid = escapeXml(ssid)
  const { authentication, encryption } = authEncryptionFor(security, cipherAlgorithm)
  const sharedKey = authenticationFor(security) ? sharedKeyXml(password) : ''
  return `<?xml version="1.0"?>
<WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1">
  <name>${escapedSsid}</name>
  <SSIDConfig><SSID><hex>${ssidHex(ssid)}</hex><name>${escapedSsid}</name></SSID></SSIDConfig>
  <connectionType>ESS</connectionType>
  <connectionMode>auto</connectionMode>
  <MSM><security>
    <authEncryption><authentication>${authentication}</authentication><encryption>${encryption}</encryption><useOneX>false</useOneX></authEncryption>
    ${sharedKey}
  </security></MSM>
</WLANProfile>`
}

module.exports = { buildProfileXml, isValidPassphrase }

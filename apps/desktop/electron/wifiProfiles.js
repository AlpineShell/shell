const XML_ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }
const ENTERPRISE_AUTHENTICATIONS = new Map([[3, 'WPA'], [6, 'WPA2'], [11, 'WPA3ENT']])

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

function enterpriseAuthenticationFor(authAlgorithm) {
  return ENTERPRISE_AUTHENTICATIONS.get(authAlgorithm) ?? null
}

function encryptionFor(cipherAlgorithm) {
  return cipherAlgorithm === 2 ? 'TKIP' : 'AES'
}

function authEncryptionFor(security, cipherAlgorithm) {
  if (security === 'open') return { authentication: 'open', encryption: 'none' }
  if (security === 'owe') return { authentication: 'OWE', encryption: 'AES' }
  const authentication = authenticationFor(security)
  if (!authentication) throw new Error('Unsupported Wi-Fi security')
  return { authentication, encryption: encryptionFor(cipherAlgorithm) }
}

function sharedKeyXml(password) {
  if (typeof password !== 'string' || password.length === 0) return ''
  const keyType = /^[\da-fA-F]{64}$/.test(password) ? 'networkKey' : 'passPhrase'
  return `<sharedKey><keyType>${keyType}</keyType><protected>false</protected><keyMaterial>${escapeXml(password)}</keyMaterial></sharedKey>`
}

function wlanProfileXml(ssid, securityXml) {
  const escapedSsid = escapeXml(ssid)
  return `<?xml version="1.0"?>
<WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1">
  <name>${escapedSsid}</name>
  <SSIDConfig><SSID><hex>${ssidHex(ssid)}</hex><name>${escapedSsid}</name></SSID></SSIDConfig>
  <connectionType>ESS</connectionType>
  <connectionMode>auto</connectionMode>
  <MSM><security>
    ${securityXml}
  </security></MSM>
</WLANProfile>`
}

function buildProfileXml({ ssid, security, cipherAlgorithm, password }) {
  const { authentication, encryption } = authEncryptionFor(security, cipherAlgorithm)
  const sharedKey = authenticationFor(security) ? sharedKeyXml(password) : ''
  return wlanProfileXml(ssid, `<authEncryption><authentication>${authentication}</authentication><encryption>${encryption}</encryption><useOneX>false</useOneX></authEncryption>
    ${sharedKey}`)
}

function peapMsChapV2Xml(validateServer) {
  return `<OneX xmlns="http://www.microsoft.com/networking/OneX/v1">
      <cacheUserData>true</cacheUserData>
      <authMode>user</authMode>
      <EAPConfig><EapHostConfig xmlns="http://www.microsoft.com/provisioning/EapHostConfig">
        <EapMethod>
          <Type xmlns="http://www.microsoft.com/provisioning/EapCommon">25</Type>
          <VendorId xmlns="http://www.microsoft.com/provisioning/EapCommon">0</VendorId>
          <VendorType xmlns="http://www.microsoft.com/provisioning/EapCommon">0</VendorType>
          <AuthorId xmlns="http://www.microsoft.com/provisioning/EapCommon">0</AuthorId>
        </EapMethod>
        <Config xmlns="http://www.microsoft.com/provisioning/EapHostConfig">
          <Eap xmlns="http://www.microsoft.com/provisioning/BaseEapConnectionPropertiesV1">
            <Type>25</Type>
            <EapType xmlns="http://www.microsoft.com/provisioning/MsPeapConnectionPropertiesV1">
              <ServerValidation>
                <DisableUserPromptForServerValidation>true</DisableUserPromptForServerValidation>
                <ServerNames></ServerNames>
              </ServerValidation>
              <FastReconnect>true</FastReconnect>
              <InnerEapOptional>false</InnerEapOptional>
              <Eap xmlns="http://www.microsoft.com/provisioning/BaseEapConnectionPropertiesV1">
                <Type>26</Type>
                <EapType xmlns="http://www.microsoft.com/provisioning/MsChapV2ConnectionPropertiesV1">
                  <UseWinLogonCredentials>false</UseWinLogonCredentials>
                </EapType>
              </Eap>
              <EnableQuarantineChecks>false</EnableQuarantineChecks>
              <RequireCryptoBinding>false</RequireCryptoBinding>
              <PeapExtensions>
                <PerformServerValidation xmlns="http://www.microsoft.com/provisioning/MsPeapConnectionPropertiesV2">${validateServer ? 'true' : 'false'}</PerformServerValidation>
                <AcceptServerName xmlns="http://www.microsoft.com/provisioning/MsPeapConnectionPropertiesV2">false</AcceptServerName>
              </PeapExtensions>
            </EapType>
          </Eap>
        </Config>
      </EapHostConfig></EAPConfig>
    </OneX>`
}

function buildEnterpriseProfileXml({ ssid, authAlgorithm, cipherAlgorithm, validateServer }) {
  const authentication = enterpriseAuthenticationFor(authAlgorithm)
  if (!authentication) throw new Error('Unsupported Wi-Fi security')
  return wlanProfileXml(ssid, `<authEncryption><authentication>${authentication}</authentication><encryption>${encryptionFor(cipherAlgorithm)}</encryption><useOneX>true</useOneX></authEncryption>
    ${peapMsChapV2Xml(validateServer)}`)
}

function splitLogonDomain(username) {
  const separator = username.indexOf('\\')
  if (separator < 0) return { domain: '', user: username }
  return { domain: username.slice(0, separator), user: username.slice(separator + 1) }
}

function buildEnterpriseCredentialsXml({ username, password }) {
  const { domain, user } = splitLogonDomain(username)
  return `<?xml version="1.0"?>
<EapHostUserCredentials xmlns="http://www.microsoft.com/provisioning/EapHostUserCredentials" xmlns:eapCommon="http://www.microsoft.com/provisioning/EapCommon" xmlns:baseEap="http://www.microsoft.com/provisioning/BaseEapMethodUserCredentials">
  <EapMethod>
    <eapCommon:Type>25</eapCommon:Type>
    <eapCommon:AuthorId>0</eapCommon:AuthorId>
  </EapMethod>
  <Credentials xmlns:eapUser="http://www.microsoft.com/provisioning/EapUserPropertiesV1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:baseEap="http://www.microsoft.com/provisioning/BaseEapUserPropertiesV1" xmlns:MsPeap="http://www.microsoft.com/provisioning/MsPeapUserPropertiesV1" xmlns:MsChapV2="http://www.microsoft.com/provisioning/MsChapV2UserPropertiesV1">
    <baseEap:Eap>
      <baseEap:Type>25</baseEap:Type>
      <MsPeap:EapType>
        <MsPeap:RoutingIdentity>${escapeXml(username)}</MsPeap:RoutingIdentity>
        <baseEap:Eap>
          <baseEap:Type>26</baseEap:Type>
          <MsChapV2:EapType>
            <MsChapV2:Username>${escapeXml(user)}</MsChapV2:Username>
            <MsChapV2:Password>${escapeXml(password)}</MsChapV2:Password>
            <MsChapV2:LogonDomain>${escapeXml(domain)}</MsChapV2:LogonDomain>
          </MsChapV2:EapType>
        </baseEap:Eap>
      </MsPeap:EapType>
    </baseEap:Eap>
  </Credentials>
</EapHostUserCredentials>`
}

module.exports = {
  buildEnterpriseCredentialsXml,
  buildEnterpriseProfileXml,
  buildProfileXml,
  enterpriseAuthenticationFor,
  isValidPassphrase,
}

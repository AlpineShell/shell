const PRIVILEGED_SCHEMES = [
  { scheme: 'alpine-wallpaper', privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: true, stream: true } },
  { scheme: 'alpine-plugin', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]

module.exports = { PRIVILEGED_SCHEMES }

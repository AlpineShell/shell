const { loadNativeAudioEndpoint } = require('./audioEndpointNative')

function prefersPowerShellAudio() {
  const { app } = require('electron')
  return !app.isPackaged && process.env.ALPINE_AUDIO_BACKEND === 'powershell'
}

function loadAudioEndpoint() {
  const endpoint = (!prefersPowerShellAudio() && loadNativeAudioEndpoint()) || require('./audioEndpointPowerShell')
  console.log(`[volume] audio backend: ${endpoint.kind}`)
  return endpoint
}

module.exports = { loadAudioEndpoint }

const { loadNativeMicrophoneCapturers } = require('./microphoneCapturersNative')

function prefersPowerShellMicrophone(isPackaged, env) {
  return !isPackaged && env.ALPINE_MICROPHONE_BACKEND === 'powershell'
}

function loadMicrophoneCapturers() {
  const { app } = require('electron')
  const capturers = (!prefersPowerShellMicrophone(app.isPackaged, process.env) && loadNativeMicrophoneCapturers())
    || require('./microphoneCapturersPowerShell')
  console.log(`[microphone] capture backend: ${capturers.kind}`)
  return capturers
}

module.exports = { loadMicrophoneCapturers, prefersPowerShellMicrophone }

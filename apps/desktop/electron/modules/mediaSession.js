const MEDIA_CHANNELS = ['media/session', 'media/timeline', 'media/seek', 'media/control']

function prefersPowerShellMedia(isPackaged, env) {
  return !isPackaged && env.ALPINE_MEDIA_BACKEND === 'powershell'
}

function runningUnpackagedPowerShellPreference() {
  const { app } = require('electron')
  return prefersPowerShellMedia(app.isPackaged, process.env)
}

function createMediaSessionChooser({ loadNative, loadPowerShell, prefersPowerShell }) {
  let chosen = null

  function mediaSession() {
    if (chosen) return chosen
    chosen = (!prefersPowerShell() && loadNative()) || loadPowerShell()
    console.log(`[media] media session backend: ${chosen.kind}`)
    return chosen
  }

  const handlers = Object.fromEntries(
    MEDIA_CHANNELS.map((channel) => [channel, (...args) => mediaSession().handlers[channel](...args)]),
  )

  return {
    handlers,
    start: (broadcast) => mediaSession().start(broadcast),
  }
}

function loadNativeMediaSession() {
  const source = require('./mediaSessionNative').loadNativeMediaSource()
  if (!source) return null
  const { createEventDrivenMediaSession } = require('./mediaSessionEvents')
  const { getAppIcon } = require('./mediaAppIcon')
  return createEventDrivenMediaSession({ source, getAppIcon })
}

const shellMediaSession = createMediaSessionChooser({
  loadNative: loadNativeMediaSession,
  loadPowerShell: () => require('./mediaSessionPowerShell'),
  prefersPowerShell: runningUnpackagedPowerShellPreference,
})

module.exports = {
  handlers: shellMediaSession.handlers,
  start: shellMediaSession.start,
  MEDIA_CHANNELS,
  createMediaSessionChooser,
  prefersPowerShellMedia,
}

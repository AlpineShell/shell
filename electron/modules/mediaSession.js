const { exec } = require('child_process')
const path = require('path')

let lastTitle = null
let lastArtist = null
let lastPlaying = false

const scriptPath = path.join(__dirname, '..', 'scripts', 'mediaSession.ps1')

function getMediaSession() {
  return new Promise((resolve) => {
    exec(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`,
      (err, stdout) => {
        if (err || !stdout) return resolve({ title: null, artist: null, playing: false })
        try {
          const parsed = JSON.parse(stdout.trim())
          resolve({
            title: parsed.title || null,
            artist: parsed.artist || null,
            playing: !!parsed.playing,
          })
        } catch {
          resolve({ title: null, artist: null, playing: false })
        }
      }
    )
  })
}

module.exports = {
  handlers: {
    'media/session': () => getMediaSession(),
  },

  start(broadcast) {
    setInterval(async () => {
      const current = await getMediaSession()
      if (current.title !== lastTitle || current.artist !== lastArtist || current.playing !== lastPlaying) {
        lastTitle = current.title
        lastArtist = current.artist
        lastPlaying = current.playing
        broadcast('media/session-changed', current)
      }
    }, 3000)
  },
}

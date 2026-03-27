const { spawn } = require('child_process')
const { app } = require('electron')
const path = require('path')
const fs = require('fs')

const iconCache = new Map()

async function getAppIcon(appId) {
    if (!appId) return null
    if (iconCache.has(appId)) return iconCache.get(appId)
    try {
        const icon = await app.getFileIcon(`shell:AppsFolder\\${appId}`, { size: 'normal' })
        const b64 = icon.toPNG().toString('base64')
        iconCache.set(appId, b64)
        return b64
    } catch {
        iconCache.set(appId, null)
        return null
    }
}

const SCRIPT_PATH = path.join(__dirname, '..', 'scripts', 'media.ps1')
const DELIM = '__MEDIA_DONE__'

let ps = null
let psReady = null
let pendingResolve = null
let outputBuf = ''
let commandQueue = []
let busy = false

let lastTitle = null
let lastArtist = null
let lastAppName = null
let lastPlaying = false

function initPS() {
  if (psReady) return psReady
  psReady = new Promise((resolveInit) => {
    ps = spawn('powershell', [
      '-NoProfile', '-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', '-'
    ], { stdio: ['pipe', 'pipe', 'ignore'] })

    ps.stdout.on('data', (chunk) => {
      outputBuf += chunk.toString()
      const idx = outputBuf.indexOf(DELIM)
      if (idx !== -1) {
        const result = outputBuf.substring(0, idx).trim()
        outputBuf = outputBuf.substring(idx + DELIM.length).replace(/^\r?\n/, '')
        if (pendingResolve) {
          const r = pendingResolve
          pendingResolve = null
          r(result)
        }
      }
    })

    ps.on('exit', () => {
      ps = null
      psReady = null
      busy = false
      if (pendingResolve) { pendingResolve(''); pendingResolve = null }
      for (const { resolve } of commandQueue) resolve('')
      commandQueue = []
    })

    const script = fs.readFileSync(SCRIPT_PATH, 'utf8')
    pendingResolve = () => { resolveInit(); processNext() }
    ps.stdin.write(`${script}\nWrite-Output '${DELIM}'\n`)
  })
  return psReady
}

function processNext() {
  if (commandQueue.length === 0) { busy = false; return }
  busy = true
  const { cmd, resolve } = commandQueue.shift()
  pendingResolve = (result) => {
    resolve(result)
    processNext()
  }
  ps.stdin.write(`${cmd}\nWrite-Output '${DELIM}'\n`)
}

async function runCmd(cmd) {
  await initPS()
  return new Promise((resolve) => {
    commandQueue.push({ cmd, resolve })
    if (!busy) processNext()
  })
}

let lastThumbnail = null
let lastThumbnailType = null

async function getMediaInfoFast() {
  const raw = await runCmd('MediaInfoFast')
  if (!raw) return { title: null, artist: null, appName: null, playing: false }
  try {
    const parsed = JSON.parse(raw)
    const appIcon = await getAppIcon(parsed.appId || null)
    return { title: parsed.title || null, artist: parsed.artist || null, appName: parsed.appName || null, appIcon, playing: !!parsed.playing }
  } catch {
    return { title: null, artist: null, appName: null, playing: false }
  }
}

async function getMediaThumbnail() {
  const raw = await runCmd('MediaThumbnail')
  if (!raw) return { thumbnail: null, thumbnailType: null }
  try {
    const parsed = JSON.parse(raw)
    return { thumbnail: parsed.thumbnail || null, thumbnailType: parsed.thumbnailType || null }
  } catch {
    return { thumbnail: null, thumbnailType: null }
  }
}

async function getMediaSession() {
  const raw = await runCmd('MediaInfo')
  if (!raw) return { title: null, artist: null, appName: null, playing: false, thumbnail: null, thumbnailType: null }
  try {
    const parsed = JSON.parse(raw)
    return {
      title: parsed.title || null,
      artist: parsed.artist || null,
      appName: parsed.appName || null,
      playing: !!parsed.playing,
      thumbnail: parsed.thumbnail || null,
      thumbnailType: parsed.thumbnailType || null,
    }
  } catch {
    return { title: null, artist: null, appName: null, playing: false, thumbnail: null, thumbnailType: null }
  }
}

async function mediaControl(action) {
  const raw = await runCmd(`MediaControl '${action}'`)
  try { return JSON.parse(raw) } catch { return { success: false } }
}

let broadcastRef = null

function broadcastFast() {
  if (!broadcastRef) return
  getMediaInfoFast().then((current) => {
    if (current.title !== lastTitle || current.artist !== lastArtist || current.playing !== lastPlaying) {
      const titleChanged = current.title !== lastTitle
      lastTitle = current.title
      lastArtist = current.artist
      lastAppName = current.appName
      lastPlaying = current.playing
      broadcastRef('media/session-changed', {
        ...current,
        thumbnail: lastThumbnail,
        thumbnailType: lastThumbnailType,
      })
      if (titleChanged) {
        getMediaThumbnail().then((thumb) => {
          lastThumbnail = thumb.thumbnail
          lastThumbnailType = thumb.thumbnailType
          broadcastRef('media/session-changed', {
            title: lastTitle,
            artist: lastArtist,
            appName: lastAppName,
            playing: lastPlaying,
            ...thumb,
          })
        })
      }
    }
  })
}

function pollUntilDifferent(key, prevValue, attempts) {
  if (attempts <= 0 || !broadcastRef) return
  getMediaInfoFast().then((current) => {
    if (current[key] !== prevValue) {
      const titleChanged = current.title !== lastTitle
      lastTitle = current.title
      lastArtist = current.artist
      lastAppName = current.appName
      lastPlaying = current.playing
      broadcastRef('media/session-changed', {
        ...current,
        thumbnail: lastThumbnail,
        thumbnailType: lastThumbnailType,
      })
      if (titleChanged) {
        getMediaThumbnail().then((thumb) => {
          lastThumbnail = thumb.thumbnail
          lastThumbnailType = thumb.thumbnailType
          broadcastRef('media/session-changed', {
            title: lastTitle,
            artist: lastArtist,
            appName: lastAppName,
            playing: lastPlaying,
            ...thumb,
          })
        })
      }
    } else {
      setTimeout(() => pollUntilDifferent(key, prevValue, attempts - 1), 100)
    }
  })
}

module.exports = {
  handlers: {
    'media/session': () => getMediaSession(),
    'media/control': async (_event, action) => {
      const prevTitle = lastTitle
      const prevPlaying = lastPlaying
      const result = await mediaControl(action)
      if (action === 'next' || action === 'previous') {
        setTimeout(() => pollUntilDifferent('title', prevTitle, 15), 100)
      } else {
        setTimeout(() => pollUntilDifferent('playing', prevPlaying, 10), 100)
      }
      return result
    },
  },

  start(broadcast) {
    broadcastRef = broadcast
    initPS()
    getMediaSession().then((initial) => {
      lastTitle = initial.title
      lastArtist = initial.artist
      lastAppName = initial.appName
      lastPlaying = initial.playing
      lastThumbnail = initial.thumbnail
      lastThumbnailType = initial.thumbnailType
    })
    setInterval(broadcastFast, 1000)
  },
}

const { spawn } = require('child_process')
const { app } = require('electron')
const path = require('path')
const fs = require('fs')
const { getAppIcon } = require('./mediaAppIcon')
const { timelineOf, timelineChanged, seekTarget, seekTimeline, settleTimeline } = require('./mediaTimeline')

const SCRIPT_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'scripts', 'media.ps1')
  : path.join(__dirname, '..', 'scripts', 'media.ps1')
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
    ps.stdin.write(`[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\n$OutputEncoding = [System.Text.Encoding]::UTF8\n${script}\nWrite-Output '${DELIM}'\n`)
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
let lastAppIcon = null
let lastTimeline = null
let seekBase = null

async function getMediaInfoFast() {
  const raw = await runCmd('MediaInfoFast')
  if (!raw) return { title: null, artist: null, appName: null, playing: false }
  try {
    const parsed = JSON.parse(raw)
    const appIcon = await getAppIcon(parsed.appId || null)
    return { title: parsed.title || null, artist: parsed.artist || null, appName: parsed.appName || null, appIcon, playing: !!parsed.playing, timeline: timelineOf(parsed) }
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
  if (!raw) return { title: null, artist: null, appName: null, appIcon: null, playing: false, thumbnail: null, thumbnailType: null }
  try {
    const parsed = JSON.parse(raw)
    const appIcon = await getAppIcon(parsed.appId || null)
    return {
      title: parsed.title || null,
      artist: parsed.artist || null,
      appName: parsed.appName || null,
      appIcon,
      playing: !!parsed.playing,
      thumbnail: parsed.thumbnail || null,
      thumbnailType: parsed.thumbnailType || null,
    }
  } catch {
    return { title: null, artist: null, appName: null, appIcon: null, playing: false, thumbnail: null, thumbnailType: null }
  }
}

async function mediaControl(action) {
  const raw = await runCmd(`MediaControl '${action}'`)
  try { return JSON.parse(raw) } catch { return { success: false } }
}

let broadcastRef = null

function settle(measured) {
  const settled = settleTimeline(lastTimeline, measured, seekBase)
  seekBase = settled.seekBase
  return settled.timeline
}

function publishTimeline(measured) {
  const timeline = settle(measured)
  if (!timelineChanged(lastTimeline, timeline)) return
  lastTimeline = timeline
  broadcastRef?.('media/timeline-changed', timeline)
}

async function getMediaTimeline() {
  const current = await getMediaInfoFast()
  lastTimeline = settle(current.timeline ?? null)
  return lastTimeline
}

async function seekMedia(positionMs) {
  const target = seekTarget(lastTimeline, positionMs)
  if (target === null) return { success: false }
  const raw = await runCmd(`MediaSeek ${target}`)
  let result
  try { result = JSON.parse(raw) } catch { result = { success: false } }
  if (result.success && lastTimeline) {
    seekBase = seekBase ?? lastTimeline.updatedAt
    lastTimeline = seekTimeline(lastTimeline, target, Date.now())
    broadcastRef?.('media/timeline-changed', lastTimeline)
  }
  return { success: !!result.success }
}

function broadcastFast() {
  if (!broadcastRef) return
  getMediaInfoFast().then((current) => {
    publishTimeline(current.timeline ?? null)
    if (current.title !== lastTitle || current.artist !== lastArtist || current.playing !== lastPlaying || current.appIcon !== lastAppIcon) {
      const titleChanged = current.title !== lastTitle
      lastTitle = current.title
      lastArtist = current.artist
      lastAppName = current.appName
      lastAppIcon = current.appIcon
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
            appIcon: lastAppIcon,
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
    publishTimeline(current.timeline ?? null)
    if (current[key] !== prevValue) {
      const titleChanged = current.title !== lastTitle
      lastTitle = current.title
      lastArtist = current.artist
      lastAppName = current.appName
      lastAppIcon = current.appIcon
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
            appIcon: lastAppIcon,
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
  kind: 'powershell',
  handlers: {
    'media/session': () => getMediaSession(),
    'media/timeline': () => getMediaTimeline(),
    'media/seek': (_event, positionMs) => seekMedia(positionMs),
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
      lastAppIcon = initial.appIcon
      lastPlaying = initial.playing
      lastThumbnail = initial.thumbnail
      lastThumbnailType = initial.thumbnailType
    })
    setInterval(broadcastFast, 1000)
  },
}

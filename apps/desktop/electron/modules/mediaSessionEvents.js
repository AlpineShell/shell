const { timelineOf, timelineChanged, seekTarget, seekTimeline, settleTimeline } = require('./mediaTimeline')

const RECONCILE_INTERVAL_MS = 5000

const NO_PLAYBACK = { title: null, artist: null, appName: null, appIcon: null, playing: false, thumbnail: null, thumbnailType: null }

const PLAYBACK_FIELDS = Object.keys(NO_PLAYBACK)

function playbackChanged(previous, next) {
  return PLAYBACK_FIELDS.some((field) => previous[field] !== next[field])
}

function logMediaFailure(error) {
  console.error('[media]', error?.message ?? error)
}

function createEventDrivenMediaSession({ source, getAppIcon, logFailure = logMediaFailure, reconcileIntervalMs = RECONCILE_INTERVAL_MS }) {
  let broadcast = null
  let playback = NO_PLAYBACK
  let lastTimeline = null
  let seekBase = null
  let watching = false
  let applying = Promise.resolve()

  async function playbackOf(info, earlierThumbnail) {
    const thumbnailSource = info.thumbnailRead ? info : earlierThumbnail
    return {
      title: info.title,
      artist: info.artist,
      appName: info.appName,
      appIcon: await getAppIcon(info.appId),
      playing: info.playing,
      thumbnail: thumbnailSource.thumbnail,
      thumbnailType: thumbnailSource.thumbnailType,
    }
  }

  function settle(measured) {
    const settled = settleTimeline(lastTimeline, measured, seekBase)
    seekBase = settled.seekBase
    return settled.timeline
  }

  function publishTimeline(measured) {
    const timeline = settle(measured)
    if (!timelineChanged(lastTimeline, timeline)) return
    lastTimeline = timeline
    broadcast?.('media/timeline-changed', timeline)
  }

  async function applyInfo(info) {
    publishTimeline(timelineOf(info))
    const next = await playbackOf(info, playback)
    if (!playbackChanged(playback, next)) return
    playback = next
    broadcast?.('media/session-changed', playback)
  }

  function receive(info) {
    applying = applying.then(() => applyInfo(info)).catch(logFailure)
  }

  async function readSession() {
    try {
      return await playbackOf(await source.read(true), NO_PLAYBACK)
    } catch (e) {
      logFailure(e)
      return NO_PLAYBACK
    }
  }

  async function readTimeline() {
    let measured = null
    try {
      measured = timelineOf(await source.read(false))
    } catch (e) {
      logFailure(e)
    }
    lastTimeline = settle(measured)
    return lastTimeline
  }

  async function seek(positionMs) {
    const target = seekTarget(lastTimeline, positionMs)
    if (target === null) return { success: false }
    let success = false
    try {
      success = !!(await source.seek(target))
    } catch (e) {
      logFailure(e)
    }
    if (success && lastTimeline) {
      seekBase = seekBase ?? lastTimeline.updatedAt
      lastTimeline = seekTimeline(lastTimeline, target, Date.now())
      broadcast?.('media/timeline-changed', lastTimeline)
    }
    return { success }
  }

  async function control(action) {
    try {
      return { success: !!(await source.control(action)) }
    } catch (e) {
      logFailure(e)
      return { success: false }
    }
  }

  function watch() {
    source.watch(receive).then(() => { watching = true }, logFailure)
  }

  function reconcile() {
    if (watching) source.refresh().catch(logFailure)
    else watch()
  }

  function start(broadcastToWindows) {
    broadcast = broadcastToWindows
    watch()
    setInterval(reconcile, reconcileIntervalMs)
  }

  return {
    kind: source.kind,
    handlers: {
      'media/session': () => readSession(),
      'media/timeline': () => readTimeline(),
      'media/seek': (_event, positionMs) => seek(positionMs),
      'media/control': (_event, action) => control(action),
    },
    start,
  }
}

module.exports = { createEventDrivenMediaSession, RECONCILE_INTERVAL_MS }

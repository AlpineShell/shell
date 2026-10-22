const LIVE_WALLPAPER_POLL_MS = 1000

function createLiveWallpaperWatch({ isAttached, onChange, intervalMs = LIVE_WALLPAPER_POLL_MS, schedule = setInterval, cancel = clearInterval }) {
  let attached = false
  let timer = null

  function readAttached() {
    try {
      return Boolean(isAttached())
    } catch (e) {
      console.error('[liveWallpaper] attach check failed:', e?.message ?? e)
      return attached
    }
  }

  function check() {
    const next = readAttached()
    if (next === attached) return
    attached = next
    onChange(attached)
  }

  function start() {
    if (timer) return
    check()
    timer = schedule(check, intervalMs)
  }

  function stop() {
    if (timer) cancel(timer)
    timer = null
  }

  return { start, stop, check, isAttached: () => attached }
}

module.exports = { createLiveWallpaperWatch, LIVE_WALLPAPER_POLL_MS }

const { NATIVE_ADDON_PATH } = require('../nativeAddonPath')

const MEDIA_EXPORTS = ['mediaGetInfo', 'mediaControl', 'mediaSeek', 'mediaWatch', 'mediaRefreshWatch', 'mediaUnwatch']

function appNameOf(appId) {
  if (!appId) return null
  const leaf = appId.split(/[\\!]/).pop()
  return leaf.replace(/\.exe$/i, '')
}

function thumbnailOf(snapshot) {
  if (!snapshot.thumbnail || snapshot.thumbnail.length === 0) return null
  return Buffer.from(snapshot.thumbnail).toString('base64')
}

function mediaInfoOf(snapshot) {
  const appId = snapshot.appId || null
  return {
    title: snapshot.title || null,
    artist: snapshot.artist || null,
    appId,
    appName: appNameOf(appId),
    playing: !!snapshot.playing,
    positionMs: snapshot.positionMs,
    durationMs: snapshot.durationMs,
    timelineUpdatedAt: snapshot.timelineUpdatedAt,
    canSeek: !!snapshot.canSeek,
    thumbnailRead: !!snapshot.thumbnailRead,
    thumbnail: thumbnailOf(snapshot),
    thumbnailType: snapshot.thumbnailType || null,
  }
}

function bindMediaSource(addon) {
  if (MEDIA_EXPORTS.some((name) => typeof addon[name] !== 'function')) {
    throw new Error('the native add-on has no media session exports')
  }
  return {
    kind: 'native',
    read: async (withThumbnail) => mediaInfoOf(await addon.mediaGetInfo(withThumbnail)),
    control: (action) => addon.mediaControl(action),
    seek: (positionMs) => addon.mediaSeek(positionMs),
    watch: (onInfo) => addon.mediaWatch((snapshot) => onInfo(mediaInfoOf(snapshot))),
    refresh: () => addon.mediaRefreshWatch(),
    unwatch: () => addon.mediaUnwatch(),
  }
}

function loadNativeMediaSource(requireAddon = require) {
  try {
    return bindMediaSource(requireAddon(NATIVE_ADDON_PATH))
  } catch (e) {
    console.error('[media] native media session unavailable, using PowerShell:', e?.message ?? e)
    return null
  }
}

module.exports = { NATIVE_ADDON_PATH, appNameOf, mediaInfoOf, bindMediaSource, loadNativeMediaSource }

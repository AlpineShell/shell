const path = require('path')

const THUMBNAIL_MAX_WIDTH = 64
const THUMBNAIL_MAX_HEIGHT = 40
const SCREENSHOT_EXTENSION = '.png'

function thumbnailSize(width, height) {
  if (!(width > 0) || !(height > 0)) return null
  const scale = Math.min(THUMBNAIL_MAX_WIDTH / width, THUMBNAIL_MAX_HEIGHT / height, 1)
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

const twoDigits = (value) => String(value).padStart(2, '0')

function screenshotBaseName(takenAt) {
  const date = `${takenAt.getFullYear()}-${twoDigits(takenAt.getMonth() + 1)}-${twoDigits(takenAt.getDate())}`
  const time = `${twoDigits(takenAt.getHours())}.${twoDigits(takenAt.getMinutes())}.${twoDigits(takenAt.getSeconds())}`
  return `${date} ${time}`
}

function screenshotFileName(takenAt, isTaken) {
  const baseName = screenshotBaseName(takenAt)
  let fileName = `${baseName}${SCREENSHOT_EXTENSION}`
  for (let copy = 2; isTaken(fileName); copy++) fileName = `${baseName} (${copy})${SCREENSHOT_EXTENSION}`
  return fileName
}

function screenshotSavedEvent(id, thumbnail, filepath, displayId) {
  return {
    id,
    thumbnail,
    name: path.win32.basename(filepath),
    displayId: typeof displayId === 'number' ? displayId : null,
  }
}

module.exports = {
  thumbnailSize,
  screenshotFileName,
  screenshotSavedEvent,
}

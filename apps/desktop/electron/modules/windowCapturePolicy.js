const BITMAPINFOHEADER_BYTES = 40
const TITLE_BAR_STRIP_HEIGHT_DIPS = 6
const BASE_DPI = 96

function thumbnailSize(srcWidth, srcHeight, maxWidth, maxHeight) {
  const scale = Math.min(maxWidth / srcWidth, maxHeight / srcHeight, 1.0)
  return { width: Math.max(1, Math.round(srcWidth * scale)), height: Math.max(1, Math.round(srcHeight * scale)) }
}

function bitmapInfoHeader(width, height) {
  const header = Buffer.alloc(BITMAPINFOHEADER_BYTES)
  header.writeUInt32LE(BITMAPINFOHEADER_BYTES, 0)
  header.writeInt32LE(width, 4)
  header.writeInt32LE(-height, 8)
  header.writeUInt16LE(1, 12)
  header.writeUInt16LE(32, 14)
  return header
}

function makeOpaque(pixels) {
  for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255
}

function titleBarStrip({ left, top, right }, dpi) {
  const width = right - left
  if (width <= 0) return null
  const scale = (dpi || BASE_DPI) / BASE_DPI
  const barPx = Math.round(24 * scale)
  const titleBarCenter = top + barPx + Math.round(15 * scale)
  const frameInset = Math.round(8 * scale)
  const stripWidth = width - 2 * frameInset
  const stripHeight = Math.max(1, Math.round(TITLE_BAR_STRIP_HEIGHT_DIPS * scale))
  if (stripWidth <= 0) return null
  return {
    left: left + frameInset,
    top: titleBarCenter - Math.floor(stripHeight / 2),
    width: stripWidth,
    height: stripHeight,
  }
}

module.exports = { BITMAPINFOHEADER_BYTES, thumbnailSize, bitmapInfoHeader, makeOpaque, titleBarStrip }

const JPEG_START_OF_IMAGE = 0xffd8
const JPEG_MARKER_PREFIX = 0xff
const JPEG_START_OF_SCAN = 0xda
const JPEG_END_OF_IMAGE = 0xd9
const JPEG_EXIF_SEGMENT = 0xe1
const JPEG_ICC_SEGMENT = 0xe2
const JPEG_FRAME_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf])
const JPEG_COMPONENT_COUNTS = new Set([1, 3])
const EXIF_IDENTIFIER = 'Exif\0\0'
const ICC_IDENTIFIER = 'ICC_PROFILE\0'
const EXIF_ORIENTATION_TAG = 0x0112
const EXIF_IFD_ENTRY_BYTES = 12
const UPRIGHT_ORIENTATION = 1

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const PNG_HEADER_DATA_BYTES = 13
const PNG_COLOR_TYPES_WITH_ALPHA = new Set([4, 6])
const PNG_GAMMA_CHUNKS = new Set(['gAMA', 'cHRM'])

function isStandaloneJpegMarker(marker) {
  return marker === 0x01 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)
}

function startsWith(buffer, text) {
  return buffer.length >= text.length && buffer.toString('latin1', 0, text.length) === text
}

function exifOrientation(tiff) {
  if (tiff.length < 8) return null
  const byteOrder = tiff.toString('latin1', 0, 2)
  if (byteOrder !== 'II' && byteOrder !== 'MM') return null
  const littleEndian = byteOrder === 'II'
  const readUInt16 = (offset) => (littleEndian ? tiff.readUInt16LE(offset) : tiff.readUInt16BE(offset))
  const readUInt32 = (offset) => (littleEndian ? tiff.readUInt32LE(offset) : tiff.readUInt32BE(offset))
  const directoryOffset = readUInt32(4)
  if (directoryOffset + 2 > tiff.length) return null
  const entryCount = readUInt16(directoryOffset)
  for (let index = 0; index < entryCount; index += 1) {
    const entryOffset = directoryOffset + 2 + index * EXIF_IFD_ENTRY_BYTES
    if (entryOffset + EXIF_IFD_ENTRY_BYTES > tiff.length) return null
    if (readUInt16(entryOffset) === EXIF_ORIENTATION_TAG) return readUInt16(entryOffset + 8)
  }
  return UPRIGHT_ORIENTATION
}

function emptyJpegFacts() {
  return { format: 'jpeg', width: null, height: null, hasAlpha: false, colorManaged: false, orientation: UPRIGHT_ORIENTATION, animated: false, supportedComponents: true }
}

function applyJpegSegment(facts, marker, data) {
  if (marker === JPEG_EXIF_SEGMENT && startsWith(data, EXIF_IDENTIFIER)) {
    facts.orientation = exifOrientation(data.subarray(EXIF_IDENTIFIER.length))
  } else if (marker === JPEG_ICC_SEGMENT && startsWith(data, ICC_IDENTIFIER)) {
    facts.colorManaged = true
  } else if (JPEG_FRAME_MARKERS.has(marker) && data.length >= 6) {
    facts.height = data.readUInt16BE(1)
    facts.width = data.readUInt16BE(3)
    facts.supportedComponents = JPEG_COMPONENT_COUNTS.has(data[5])
  }
}

function describeJpeg(buffer) {
  if (buffer.length < 4 || buffer.readUInt16BE(0) !== JPEG_START_OF_IMAGE) return null
  const facts = emptyJpegFacts()
  let offset = 2
  while (offset + 2 <= buffer.length) {
    if (buffer[offset] !== JPEG_MARKER_PREFIX) return null
    const marker = buffer[offset + 1]
    if (marker === JPEG_MARKER_PREFIX) {
      offset += 1
      continue
    }
    if (isStandaloneJpegMarker(marker)) {
      offset += 2
      continue
    }
    if (marker === JPEG_START_OF_SCAN || marker === JPEG_END_OF_IMAGE) break
    if (offset + 4 > buffer.length) return null
    const segmentEnd = offset + 2 + buffer.readUInt16BE(offset + 2)
    if (segmentEnd > buffer.length || segmentEnd < offset + 4) return null
    applyJpegSegment(facts, marker, buffer.subarray(offset + 4, segmentEnd))
    offset = segmentEnd
  }
  return facts.width && facts.height ? facts : null
}

function emptyPngFacts() {
  return { format: 'png', width: null, height: null, hasAlpha: false, colorManaged: false, orientation: UPRIGHT_ORIENTATION, animated: false, supportedComponents: true, hasGamma: false, declaresSrgb: false }
}

function applyPngChunk(facts, type, data) {
  if (type === 'IHDR' && data.length >= PNG_HEADER_DATA_BYTES) {
    facts.width = data.readUInt32BE(0)
    facts.height = data.readUInt32BE(4)
    facts.hasAlpha = facts.hasAlpha || PNG_COLOR_TYPES_WITH_ALPHA.has(data[9])
  } else if (type === 'tRNS') {
    facts.hasAlpha = true
  } else if (type === 'iCCP') {
    facts.colorManaged = true
  } else if (PNG_GAMMA_CHUNKS.has(type)) {
    facts.hasGamma = true
  } else if (type === 'sRGB') {
    facts.declaresSrgb = true
  } else if (type === 'acTL') {
    facts.animated = true
  } else if (type === 'eXIf') {
    facts.orientation = null
  }
}

function settledPngFacts(facts) {
  if (!facts.width || !facts.height) return null
  const { hasGamma, declaresSrgb, ...settled } = facts
  return { ...settled, colorManaged: facts.colorManaged || (hasGamma && !declaresSrgb) }
}

function describePng(buffer) {
  if (buffer.length < PNG_SIGNATURE.length || !buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) return null
  const facts = emptyPngFacts()
  let offset = PNG_SIGNATURE.length
  while (offset + 8 <= buffer.length) {
    const dataStart = offset + 8
    const dataEnd = dataStart + buffer.readUInt32BE(offset)
    const type = buffer.toString('latin1', offset + 4, dataStart)
    if (type === 'IDAT') return settledPngFacts(facts)
    if (dataEnd > buffer.length) return null
    applyPngChunk(facts, type, buffer.subarray(dataStart, dataEnd))
    offset = dataEnd + 4
  }
  return null
}

function describeWallpaperImage(header) {
  return describeJpeg(header) ?? describePng(header)
}

function isSafeToRescale(facts) {
  return Boolean(facts)
    && !facts.colorManaged
    && !facts.animated
    && facts.supportedComponents
    && facts.orientation === UPRIGHT_ORIENTATION
}

module.exports = { describeWallpaperImage, isSafeToRescale }

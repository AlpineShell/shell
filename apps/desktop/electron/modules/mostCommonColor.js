const BITS_DROPPED_PER_CHANNEL = 4
const BYTES_PER_PIXEL = 4

function bucketKey(r, g, b) {
  const shift = BITS_DROPPED_PER_CHANNEL
  return ((r >> shift) << 8) | ((g >> shift) << 4) | (b >> shift)
}

function tallyBuckets(bgraPixels) {
  const buckets = new Map()
  for (let offset = 0; offset + 2 < bgraPixels.length; offset += BYTES_PER_PIXEL) {
    const b = bgraPixels[offset]
    const g = bgraPixels[offset + 1]
    const r = bgraPixels[offset + 2]
    const key = bucketKey(r, g, b)
    const bucket = buckets.get(key)
    if (bucket) {
      bucket.count++
      bucket.r += r
      bucket.g += g
      bucket.b += b
    } else {
      buckets.set(key, { count: 1, r, g, b })
    }
  }
  return buckets
}

function mostCommonColor(bgraPixels) {
  let winner = null
  for (const bucket of tallyBuckets(bgraPixels).values()) {
    if (!winner || bucket.count > winner.count) winner = bucket
  }
  if (!winner) return null
  return {
    r: Math.round(winner.r / winner.count),
    g: Math.round(winner.g / winner.count),
    b: Math.round(winner.b / winner.count),
  }
}

module.exports = { mostCommonColor }

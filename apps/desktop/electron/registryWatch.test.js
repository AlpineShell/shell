import { describe, it, expect } from 'vitest'
import { decodeRegistryString } from './registryWatch.js'

function utf16Buffer(text, { terminated = true, capacity = 64 } = {}) {
  const buffer = Buffer.alloc(capacity)
  const written = buffer.write(text, 0, 'ucs2')
  const byteCount = terminated ? written + 2 : written
  return { buffer, byteCount }
}

describe('decodeRegistryString', () => {
  it('drops the terminator of a null-terminated value', () => {
    const { buffer, byteCount } = utf16Buffer('wallpaper.jpg')
    expect(decodeRegistryString(buffer, byteCount)).toBe('wallpaper.jpg')
  })

  it('keeps the last character of a value stored without a terminator', () => {
    const { buffer, byteCount } = utf16Buffer('wallpaper.jpg', { terminated: false })
    expect(decodeRegistryString(buffer, byteCount)).toBe('wallpaper.jpg')
  })

  it('stops at the first terminator inside an oversized byte count', () => {
    const { buffer } = utf16Buffer('one')
    expect(decodeRegistryString(buffer, buffer.length)).toBe('one')
  })

  it('never reads past the end of the buffer', () => {
    const { buffer } = utf16Buffer('two', { terminated: false, capacity: 6 })
    expect(decodeRegistryString(buffer, 4096)).toBe('two')
  })

  it('ignores a trailing half code unit', () => {
    const { buffer, byteCount } = utf16Buffer('odd', { terminated: false })
    expect(decodeRegistryString(buffer, byteCount + 1)).toBe('odd')
  })

  it('reports an empty value as null', () => {
    expect(decodeRegistryString(Buffer.alloc(8), 0)).toBe(null)
    expect(decodeRegistryString(Buffer.alloc(8), 2)).toBe(null)
  })

  it('treats a negative byte count as empty', () => {
    expect(decodeRegistryString(Buffer.alloc(8), -4)).toBe(null)
  })
})

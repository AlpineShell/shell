import { describe, expect, it } from 'vitest'

const { openStreetMapUrl } = await import('./mapLink.js')

describe('openStreetMapUrl', () => {
  it('builds the OpenStreetMap page for a place', () => {
    expect(openStreetMapUrl({ lat: 47.3769, lon: 8.5417 })).toBe('https://www.openstreetmap.org/?mlat=47.3769&mlon=8.5417#map=16/47.3769/8.5417')
  })

  it('accepts negative coordinates and the edges of the map', () => {
    expect(openStreetMapUrl({ lat: -33.8688, lon: -151.2093 })).toBe('https://www.openstreetmap.org/?mlat=-33.8688&mlon=-151.2093#map=16/-33.8688/-151.2093')
    expect(openStreetMapUrl({ lat: 90, lon: -180 })).toBe('https://www.openstreetmap.org/?mlat=90&mlon=-180#map=16/90/-180')
  })

  it('refuses anything that is not a pair of numbers on the map', () => {
    expect(openStreetMapUrl({ lat: '47.3', lon: 8.5 })).toBeNull()
    expect(openStreetMapUrl({ lat: 47.3, lon: '8.5#x' })).toBeNull()
    expect(openStreetMapUrl({ lat: Number.NaN, lon: 8.5 })).toBeNull()
    expect(openStreetMapUrl({ lat: 91, lon: 8.5 })).toBeNull()
    expect(openStreetMapUrl({ lat: 47.3, lon: 180.5 })).toBeNull()
    expect(openStreetMapUrl({ lat: 47.3 })).toBeNull()
    expect(openStreetMapUrl(null)).toBeNull()
  })
})

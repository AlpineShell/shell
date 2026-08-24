import { describe, it, expect } from 'vitest'
import browserFavicons from './browserFavicons.js'

const { preferredIconIdsByHost, candidateIds, iconMapFromBlobs, idBatches, collectBlobs } = browserFavicons

describe('preferredIconIdsByHost', () => {
  it('keeps only hosts that were asked for', () => {
    const rows = [
      ['https://github.com/a', 7],
      ['https://unrelated.example/a', 9],
    ]
    const map = preferredIconIdsByHost(rows, new Set(['github.com']))
    expect([...map]).toEqual([['github.com', [7]]])
  })

  it('ranks the icon mapped to the most pages of a host first', () => {
    const rows = [
      ['https://news.example/one', 4],
      ['https://news.example/two', 5],
      ['https://news.example/three', 5],
    ]
    expect(preferredIconIdsByHost(rows, new Set(['news.example'])).get('news.example')).toEqual([5, 4])
  })

  it('breaks ties on the most recently stored icon id', () => {
    const rows = [
      ['https://news.example/one', 4],
      ['https://news.example/two', 11],
    ]
    expect(preferredIconIdsByHost(rows, new Set(['news.example'])).get('news.example')[0]).toBe(11)
  })

  it('keeps at most three candidates per host', () => {
    const rows = [1, 2, 3, 4, 5].map((iconId) => [`https://news.example/${iconId}`, iconId])
    expect(preferredIconIdsByHost(rows, new Set(['news.example'])).get('news.example')).toEqual([5, 4, 3])
  })

  it('keeps the port so localhost apps stay distinct', () => {
    const rows = [
      ['http://localhost:5173/en', 2],
      ['http://localhost:1455/ok', 3],
    ]
    const map = preferredIconIdsByHost(rows, new Set(['localhost:5173', 'localhost:1455']))
    expect(map.get('localhost:5173')).toEqual([2])
    expect(map.get('localhost:1455')).toEqual([3])
  })

  it('needs no host escaping, so hosts the old range filter rejected still resolve', () => {
    const rows = [
      ['https://xn--mnchen-3ya.de/x', 12],
      ['https://[::1]/x', 13],
    ]
    const map = preferredIconIdsByHost(rows, new Set(['xn--mnchen-3ya.de', '[::1]']))
    expect(map.size).toBe(2)
  })

  it('skips unparseable urls and missing icon ids', () => {
    const rows = [
      ['not a url', 1],
      ['https://ok.example/x', 0],
      ['https://ok.example/y', null],
      [null, 3],
    ]
    expect(preferredIconIdsByHost(rows, new Set(['ok.example'])).size).toBe(0)
  })
})

describe('candidateIds', () => {
  it('asks for every candidate once across all hosts', () => {
    const iconIdsByHost = new Map([['a.example', [4, 9]], ['b.example', [9, 1]]])
    expect(candidateIds(iconIdsByHost)).toEqual([4, 9, 1])
  })
})

describe('iconMapFromBlobs', () => {
  it('encodes only the hosts whose icon blob was read', () => {
    const iconIdsByHost = new Map([['a.example', [1]], ['b.example', [2]]])
    const blobById = new Map([[1, Buffer.from([1, 2, 3])]])
    const map = iconMapFromBlobs(iconIdsByHost, blobById, (data) => (data ? data.toString('hex') : null))
    expect([...map]).toEqual([['a.example', '010203']])
  })

  it('falls through to the next candidate when the preferred icon has no decodable bitmap', () => {
    const iconIdsByHost = new Map([['a.example', [1, 2]]])
    const blobById = new Map([[2, Buffer.from('png')]])
    const map = iconMapFromBlobs(iconIdsByHost, blobById, (data) => (data ? data.toString() : null))
    expect(map.get('a.example')).toBe('png')
  })

  it('falls through when the preferred bitmap is present but the encoder rejects its format', () => {
    const iconIdsByHost = new Map([['a.example', [1, 2]]])
    const blobById = new Map([[1, Buffer.from('webp')], [2, Buffer.from('png')]])
    const map = iconMapFromBlobs(iconIdsByHost, blobById, (data) => {
      const text = data ? data.toString() : ''
      return text === 'png' ? 'ok' : null
    })
    expect(map.get('a.example')).toBe('ok')
  })
})

describe('idBatches', () => {
  it('splits the id list so no single IN clause grows unbounded', () => {
    const ids = Array.from({ length: 1001 }, (_, i) => i + 1)
    expect(idBatches(ids).map((batch) => batch.length)).toEqual([500, 500, 1])
  })

  it('asks for nothing when there are no ids', () => {
    expect(idBatches([])).toEqual([])
  })
})

describe('collectBlobs', () => {
  it('keeps the first blob returned for an id and drops empty ones', () => {
    const blobById = collectBlobs(
      [[1, Buffer.from('first')], [1, Buffer.from('second')], [2, Buffer.alloc(0)], [3, null]],
      new Map(),
    )
    expect(blobById.get(1).toString()).toBe('first')
    expect(blobById.has(2)).toBe(false)
    expect(blobById.has(3)).toBe(false)
  })
})

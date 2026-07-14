import { describe, it, expect } from 'vitest'
import browserFavicons from './browserFavicons.js'

const { hostRangeClauses } = browserFavicons

describe('hostRangeClauses', () => {
  it('builds path and port ranges per scheme for each host', () => {
    const clauses = hostRangeClauses(new Set(['github.com']), 'im.page_url')
    expect(clauses).toEqual([
      "(im.page_url >= 'http://github.com/' AND im.page_url < 'http://github.com0')",
      "(im.page_url >= 'http://github.com:' AND im.page_url < 'http://github.com;')",
      "(im.page_url >= 'https://github.com/' AND im.page_url < 'https://github.com0')",
      "(im.page_url >= 'https://github.com:' AND im.page_url < 'https://github.com;')",
    ])
  })

  it('drops hosts containing characters outside the safe set', () => {
    const clauses = hostRangeClauses(new Set(["evil'--", 'a b.com', 'ok.example.com']), 'p')
    expect(clauses).toHaveLength(4)
    expect(clauses.join(' ')).toContain('ok.example.com')
  })

  it('accepts punycode and ipv6 hosts', () => {
    const clauses = hostRangeClauses(new Set(['xn--mnchen-3ya.de', '[::1]']), 'p')
    expect(clauses).toHaveLength(8)
  })

  it('caps the number of filtered hosts', () => {
    const many = new Set(Array.from({ length: 150 }, (_, i) => `host${i}.com`))
    expect(hostRangeClauses(many, 'p')).toHaveLength(400)
  })
})

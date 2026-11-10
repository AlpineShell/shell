import { describe, expect, it } from 'vitest'
import { createRequire } from 'module'

const { nextNightly } = createRequire(import.meta.url)('./nightlyVersion.js')

const november2 = new Date('2026-11-02T02:00:00Z')

describe('nextNightly', () => {
  it('builds towards 1.0.0 while only date-based versions exist', () => {
    expect(nextNightly(['v0.20261101.0', 'v0.20261102.1'], november2)).toEqual({
      version: '1.0.0-nightly.20261102.0',
      previousTag: 'v0.20261102.1',
    })
  })

  it('builds towards the patch after the latest stable release', () => {
    expect(nextNightly(['v0.20261102.1', 'v0.1.0', 'v0.2.0', 'v0.1.1-nightly.20261101.0'], november2)).toEqual({
      version: '0.2.1-nightly.20261102.0',
      previousTag: 'v0.2.0',
    })
  })

  it('counts up when a nightly was already cut today', () => {
    const tags = ['v0.1.0', 'v0.1.1-nightly.20261102.0', 'v0.1.1-nightly.20261102.1']
    expect(nextNightly(tags, november2)).toEqual({
      version: '0.1.1-nightly.20261102.2',
      previousTag: 'v0.1.1-nightly.20261102.1',
    })
  })

  it('ignores tags that are not versions and works without any tag', () => {
    expect(nextNightly(['latest', 'v1'], november2)).toEqual({ version: '1.0.0-nightly.20261102.0', previousTag: '' })
    expect(nextNightly([], november2)).toEqual({ version: '1.0.0-nightly.20261102.0', previousTag: '' })
  })
})

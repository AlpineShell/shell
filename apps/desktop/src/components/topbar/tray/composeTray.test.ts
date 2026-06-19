import { describe, it, expect } from 'vitest'
import { composeTray } from './composeTray'

function icon(id: string) {
  return { id, hWnd: 0, uID: 0, guid: null, tooltip: '', icon: '', version: 0 }
}

describe('composeTray', () => {
  it('orders visible icons by layout.order', () => {
    const result = composeTray([icon('a'), icon('b'), icon('c')], { order: ['c', 'a', 'b'], hidden: [] })
    expect(result.visible.map((i) => i.id)).toEqual(['c', 'a', 'b'])
    expect(result.overflow).toEqual([])
  })

  it('appends icons missing from order in their original sequence', () => {
    const result = composeTray([icon('a'), icon('b'), icon('c')], { order: ['c'], hidden: [] })
    expect(result.visible.map((i) => i.id)).toEqual(['c', 'a', 'b'])
  })

  it('ignores ids in order that have no matching icon', () => {
    const result = composeTray([icon('a')], { order: ['ghost', 'a'], hidden: [] })
    expect(result.visible.map((i) => i.id)).toEqual(['a'])
  })

  it('routes hidden ids to overflow while preserving order', () => {
    const result = composeTray([icon('a'), icon('b'), icon('c')], { order: ['a', 'b', 'c'], hidden: ['b'] })
    expect(result.visible.map((i) => i.id)).toEqual(['a', 'c'])
    expect(result.overflow.map((i) => i.id)).toEqual(['b'])
  })

  it('does not duplicate an icon listed twice in order', () => {
    const result = composeTray([icon('a'), icon('b')], { order: ['a', 'a', 'b'], hidden: [] })
    expect(result.visible.map((i) => i.id)).toEqual(['a', 'b'])
  })

  it('returns empty groups for empty input', () => {
    const result = composeTray([], { order: [], hidden: [] })
    expect(result.visible).toEqual([])
    expect(result.overflow).toEqual([])
  })
})

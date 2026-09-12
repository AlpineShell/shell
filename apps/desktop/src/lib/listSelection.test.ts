import { describe, it, expect } from 'vitest'
import { moveSelection, resolveSelection } from './listSelection'

describe('resolveSelection', () => {
  it('stays on the same row when that row moves', () => {
    expect(resolveSelection(['radio', 'mouse', 'buds'], 'buds', 2)).toEqual({ id: 'buds', index: 2 })
    expect(resolveSelection(['radio', 'buds', 'mouse'], 'buds', 2)).toEqual({ id: 'buds', index: 1 })
  })

  it('falls back to the row now nearest the old position when the row disappears', () => {
    expect(resolveSelection(['radio', 'mouse'], 'buds', 2)).toEqual({ id: 'mouse', index: 1 })
    expect(resolveSelection(['radio', 'mouse', 'speaker'], 'buds', 1)).toEqual({ id: 'mouse', index: 1 })
  })

  it('keeps the radio row when the list empties', () => {
    expect(resolveSelection(['radio'], 'buds', 3)).toEqual({ id: 'radio', index: 0 })
  })

  it('resolves an unknown id at the first row', () => {
    expect(resolveSelection(['radio', 'mouse'], 'ghost', 0)).toEqual({ id: 'radio', index: 0 })
    expect(resolveSelection(['radio', 'mouse'], null, 0)).toEqual({ id: 'radio', index: 0 })
  })

  it('returns an empty selection for an empty list', () => {
    expect(resolveSelection([], 'radio', 0)).toEqual({ id: '', index: 0 })
  })
})

describe('moveSelection', () => {
  it('steps to the neighbouring row and stops at both ends', () => {
    const rows = ['radio', 'mouse', 'buds']

    expect(moveSelection(rows, { id: 'mouse', index: 1 }, 1)).toEqual({ id: 'buds', index: 2 })
    expect(moveSelection(rows, { id: 'buds', index: 2 }, 1)).toEqual({ id: 'buds', index: 2 })
    expect(moveSelection(rows, { id: 'radio', index: 0 }, -1)).toEqual({ id: 'radio', index: 0 })
  })
})

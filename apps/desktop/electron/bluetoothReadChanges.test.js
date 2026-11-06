import { describe, it, expect } from 'vitest'
import { createUnchangedReadFilter } from './bluetoothReadChanges.js'

function sequentialIds() {
  let next = 0
  return () => `read-${++next}`
}

function snapshot(name = 'Headset') {
  return { nodes: [{ instanceId: 'headset-node', status: 8, problem: 0, name }], stackIds: ['radio-node'] }
}

describe('createUnchangedReadFilter', () => {
  it('sends the first read in full', () => {
    const filter = createUnchangedReadFilter(sequentialIds())

    expect(filter.answer(snapshot(), null)).toEqual({ unchanged: false, readId: 'read-1', snapshot: snapshot() })
  })

  it('answers unchanged when the read matches the one the caller already holds', () => {
    const filter = createUnchangedReadFilter(sequentialIds())
    const first = filter.answer(snapshot(), null)

    expect(filter.answer(snapshot(), first.readId)).toEqual({ unchanged: true })
  })

  it('sends a changed read in full under a new id', () => {
    const filter = createUnchangedReadFilter(sequentialIds())
    const first = filter.answer(snapshot(), null)

    expect(filter.answer(snapshot('Speaker'), first.readId)).toEqual({ unchanged: false, readId: 'read-2', snapshot: snapshot('Speaker') })
  })

  it('sends the read in full again when the caller does not hold it', () => {
    const filter = createUnchangedReadFilter(sequentialIds())
    filter.answer(snapshot(), null)

    expect(filter.answer(snapshot(), 'read-from-an-earlier-worker')).toEqual({ unchanged: false, readId: 'read-1', snapshot: snapshot() })
  })

  it('passes a failed read through without forgetting the last one', () => {
    const filter = createUnchangedReadFilter(sequentialIds())
    const first = filter.answer(snapshot(), null)

    expect(filter.answer(null, first.readId)).toEqual({ unchanged: false, readId: null, snapshot: null })
    expect(filter.answer(snapshot(), first.readId)).toEqual({ unchanged: true })
  })

  it('never answers unchanged to a caller that holds no read', () => {
    const filter = createUnchangedReadFilter(sequentialIds())

    expect(filter.answer(snapshot(), null).unchanged).toBe(false)
    expect(filter.answer(snapshot(), null).unchanged).toBe(false)
  })
})

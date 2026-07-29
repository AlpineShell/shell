import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  nextSurfaceId,
  setSurface,
  clearSurface,
  getSurface,
  subscribeSurface,
} from './surfaceStore'

function surface(id: number) {
  return { id, centerX: 0, bodyWidth: 0, fullHeight: 0, outline: false, anchor: 'center' as const, contentEl: null }
}

afterEach(() => {
  setSurface(null)
})

describe('surfaceStore', () => {
  it('hands out strictly increasing surface ids', () => {
    expect(nextSurfaceId()).toBeLessThan(nextSurfaceId())
  })

  it('stores and returns the current surface', () => {
    const s = surface(nextSurfaceId())
    setSurface(s)
    expect(getSurface()).toBe(s)
  })

  it('notifies subscribers when the surface changes', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeSurface(listener)
    setSurface(surface(nextSurfaceId()))
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
  })

  it('stops notifying after unsubscribe', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeSurface(listener)
    unsubscribe()
    setSurface(surface(nextSurfaceId()))
    expect(listener).not.toHaveBeenCalled()
  })

  it('clears the surface only when the id matches the current one', () => {
    const s = surface(nextSurfaceId())
    setSurface(s)
    clearSurface(s.id + 999)
    expect(getSurface()).toBe(s)
    clearSurface(s.id)
    expect(getSurface()).toBeNull()
  })
})

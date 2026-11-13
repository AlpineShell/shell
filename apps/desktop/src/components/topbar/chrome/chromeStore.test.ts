import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  nextSurfaceId,
  setChromeSurface,
  clearChromeSurface,
  getChromeSurface,
  subscribeChromeSurface,
  setBarHovered,
  isBarHovered,
  subscribeBarHovered,
} from './chromeStore'

function surface(id: number) {
  return { id, centerX: 0, bodyWidth: 0, fullHeight: 0, anchor: 'center' as const, contentEl: null }
}

afterEach(() => {
  setChromeSurface(null)
})

describe('chromeStore', () => {
  it('hands out strictly increasing surface ids', () => {
    expect(nextSurfaceId()).toBeLessThan(nextSurfaceId())
  })

  it('stores and returns the current surface', () => {
    const s = surface(nextSurfaceId())
    setChromeSurface(s)
    expect(getChromeSurface()).toBe(s)
  })

  it('notifies subscribers when the surface changes', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeChromeSurface(listener)
    setChromeSurface(surface(nextSurfaceId()))
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
  })

  it('stops notifying after unsubscribe', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeChromeSurface(listener)
    unsubscribe()
    setChromeSurface(surface(nextSurfaceId()))
    expect(listener).not.toHaveBeenCalled()
  })

  it('clears the surface only when the id matches the current one', () => {
    const s = surface(nextSurfaceId())
    setChromeSurface(s)
    clearChromeSurface(s.id + 999)
    expect(getChromeSurface()).toBe(s)
    clearChromeSurface(s.id)
    expect(getChromeSurface()).toBeNull()
  })
})

describe('bar hover', () => {
  afterEach(() => {
    setBarHovered(false)
  })

  it('remembers whether the pointer is over the bar', () => {
    setBarHovered(true)
    expect(isBarHovered()).toBe(true)
    setBarHovered(false)
    expect(isBarHovered()).toBe(false)
  })

  it('notifies only when the hover actually changes', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeBarHovered(listener)
    setBarHovered(true)
    setBarHovered(true)
    setBarHovered(false)
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
    setBarHovered(true)
    expect(listener).toHaveBeenCalledTimes(2)
  })
})

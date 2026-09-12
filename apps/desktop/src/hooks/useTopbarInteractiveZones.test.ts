import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { createElement, createRef, type RefObject } from 'react'
import { useTopbarInteractiveZones } from './useTopbarInteractiveZones'

const EMPTY_BOX = { left: 0, width: 0 }

let clusterBoxes: Record<string, { left: number; width: number }>
let pendingFrames: Map<number, FrameRequestCallback>
let lastFrameId: number
let observers: FakeResizeObserver[]
let setInteractiveZones: Mock<(zones: TopbarInteractiveZone[]) => void>
let leftCluster: RefObject<HTMLDivElement | null>
let centerCluster: RefObject<HTMLDivElement | null>
let rightCluster: RefObject<HTMLDivElement | null>

class FakeResizeObserver {
  notify: ResizeObserverCallback
  observed: Element[] = []
  disconnected = false

  constructor(notify: ResizeObserverCallback) {
    this.notify = notify
    observers.push(this)
  }

  observe(target: Element) {
    this.observed.push(target)
  }

  disconnect() {
    this.disconnected = true
  }
}

function clusterRect(this: Element) {
  const { left, width } = clusterBoxes[this.id] ?? EMPTY_BOX
  return { left, right: left + width, width, top: 0, bottom: 24, height: 24, x: left, y: 0, toJSON: () => ({}) } as DOMRect
}

function ClusterRow() {
  useTopbarInteractiveZones(leftCluster, centerCluster, rightCluster)
  return createElement(
    'div',
    null,
    createElement('div', { ref: leftCluster, id: 'left' }),
    createElement('div', { ref: centerCluster, id: 'center' }),
    createElement('div', { ref: rightCluster, id: 'right' })
  )
}

function renderClusterRow() {
  return render(createElement(ClusterRow))
}

function runFrames() {
  const callbacks = [...pendingFrames.values()]
  pendingFrames.clear()
  act(() => callbacks.forEach((callback) => callback(0)))
}

function notifyResizeObservers() {
  act(() => observers.forEach((observer) => observer.notify([], observer as unknown as ResizeObserver)))
}

function resizeWindow() {
  act(() => {
    window.dispatchEvent(new Event('resize'))
  })
}

beforeEach(() => {
  clusterBoxes = {
    left: { left: 0, width: 90 },
    center: { left: 900, width: 120 },
    right: { left: 1500, width: 400 },
  }
  pendingFrames = new Map()
  lastFrameId = 0
  observers = []
  leftCluster = createRef<HTMLDivElement>()
  centerCluster = createRef<HTMLDivElement>()
  rightCluster = createRef<HTMLDivElement>()
  setInteractiveZones = vi.fn()
  Object.assign(window, { topbar: { setInteractiveZones } })
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    lastFrameId += 1
    pendingFrames.set(lastFrameId, callback)
    return lastFrameId
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => pendingFrames.delete(id))
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(clusterRect)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  delete (window as unknown as { topbar?: unknown }).topbar
})

describe('useTopbarInteractiveZones', () => {
  it('waits for a frame before it measures', () => {
    renderClusterRow()

    expect(setInteractiveZones).not.toHaveBeenCalled()
    expect(pendingFrames.size).toBe(1)
  })

  it('reports each cluster with padding, in bar order', () => {
    renderClusterRow()
    runFrames()

    expect(setInteractiveZones).toHaveBeenCalledTimes(1)
    expect(setInteractiveZones).toHaveBeenCalledWith([
      { left: -8, right: 98 },
      { left: 892, right: 1028 },
      { left: 1492, right: 1908 },
    ])
  })

  it('rounds fractional edges outwards', () => {
    clusterBoxes = { left: { left: 10.6, width: 50.2 } }
    renderClusterRow()
    runFrames()

    expect(setInteractiveZones).toHaveBeenCalledWith([{ left: 2, right: 69 }])
  })

  it('leaves out a cluster with nothing in it', () => {
    clusterBoxes.center = EMPTY_BOX
    renderClusterRow()
    runFrames()

    expect(setInteractiveZones).toHaveBeenCalledWith([
      { left: -8, right: 98 },
      { left: 1492, right: 1908 },
    ])
  })

  it('reports no zones when every cluster is empty', () => {
    clusterBoxes = {}
    renderClusterRow()
    runFrames()

    expect(setInteractiveZones).toHaveBeenCalledTimes(1)
    expect(setInteractiveZones).toHaveBeenCalledWith([])
  })

  it('watches all three clusters for size changes', () => {
    renderClusterRow()

    expect(observers).toHaveLength(1)
    expect(observers[0].observed.map((cluster) => cluster.id)).toEqual(['left', 'center', 'right'])
  })

  it('reports again when a cluster changes size', () => {
    renderClusterRow()
    runFrames()

    clusterBoxes.right = { left: 1400, width: 500 }
    notifyResizeObservers()
    runFrames()

    expect(setInteractiveZones).toHaveBeenCalledTimes(2)
    expect(setInteractiveZones).toHaveBeenLastCalledWith([
      { left: -8, right: 98 },
      { left: 892, right: 1028 },
      { left: 1392, right: 1908 },
    ])
  })

  it('reports again when a window resize moves the clusters', () => {
    renderClusterRow()
    runFrames()

    clusterBoxes.center = { left: 580, width: 120 }
    clusterBoxes.right = { left: 880, width: 400 }
    resizeWindow()
    runFrames()

    expect(setInteractiveZones).toHaveBeenCalledTimes(2)
    expect(setInteractiveZones).toHaveBeenLastCalledWith([
      { left: -8, right: 98 },
      { left: 572, right: 708 },
      { left: 872, right: 1288 },
    ])
  })

  it('stays quiet when nothing moved', () => {
    renderClusterRow()
    runFrames()

    notifyResizeObservers()
    resizeWindow()
    runFrames()

    expect(setInteractiveZones).toHaveBeenCalledTimes(1)
  })

  it('measures once per frame however many changes arrive', () => {
    renderClusterRow()
    runFrames()

    clusterBoxes.left = { left: 0, width: 120 }
    notifyResizeObservers()
    notifyResizeObservers()
    resizeWindow()

    expect(pendingFrames.size).toBe(1)
    runFrames()
    expect(setInteractiveZones).toHaveBeenCalledTimes(2)
    expect(setInteractiveZones).toHaveBeenLastCalledWith([
      { left: -8, right: 128 },
      { left: 892, right: 1028 },
      { left: 1492, right: 1908 },
    ])
  })

  it('stops watching and drops a pending frame when it unmounts', () => {
    const { unmount } = renderClusterRow()

    unmount()
    resizeWindow()

    expect(observers[0].disconnected).toBe(true)
    expect(pendingFrames.size).toBe(0)
    expect(setInteractiveZones).not.toHaveBeenCalled()
  })
})

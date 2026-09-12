import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { caretBox, edgeScrollDelta, resolveDropTarget } from '../components/settings/ridge/ridgeGeometry'

const DRAG_THRESHOLD = 5
const AUTO_SCROLL_INTERVAL = 16
const PRIMARY_BUTTON = 0

function ignore() {}

function pointOf(event: { clientX: number; clientY: number }): RidgePoint {
  return { x: event.clientX, y: event.clientY }
}

function passedThreshold(session: RidgeDragSession): boolean {
  return Math.hypot(session.pointer.x - session.origin.x, session.pointer.y - session.origin.y) >= DRAG_THRESHOLD
}

function sameTarget(first: RidgeDropTarget | null, second: RidgeDropTarget | null): boolean {
  return JSON.stringify(first) === JSON.stringify(second)
}

function targetUnderPointer(session: RidgeDragSession): RidgeDropTarget | null {
  return session.geometry ? resolveDropTarget(session.geometry, session.pointer, session.id) : null
}

function caretBoxFor(session: RidgeDragSession): RidgeBox | null {
  const target = session.target
  if (target?.kind !== 'lane' || !session.geometry) return null
  const lane = session.geometry.lanes.find((candidate) => candidate.slot === target.slot)
  return lane ? caretBox(lane, target.index, session.id) : null
}

function placeCaret(caret: HTMLDivElement | null, box: RidgeBox | null) {
  if (!caret) return
  caret.style.opacity = box ? '1' : '0'
  if (!box) return
  caret.style.transform = `translate(${box.left}px, ${box.top}px)`
  caret.style.width = `${box.right - box.left}px`
  caret.style.height = `${box.bottom - box.top}px`
}

function placeGhost(ghost: HTMLDivElement | null, session: RidgeDragSession) {
  if (!ghost) return
  ghost.style.transform = `translate(${session.pointer.x - session.grabOffset.x}px, ${session.pointer.y - session.grabOffset.y}px)`
}

function retarget(session: RidgeDragSession, setup: RidgeDragSetup) {
  const target = targetUnderPointer(session)
  if (!sameTarget(target, session.target)) {
    session.target = target
    setup.onTarget(target)
  }
  placeCaret(setup.caret.current, caretBoxFor(session))
}

function remeasure(session: RidgeDragSession, setup: RidgeDragSetup) {
  session.geometry = setup.measure()
  retarget(session, setup)
}

function lift(session: RidgeDragSession, setup: RidgeDragSetup) {
  session.active = true
  session.scroller = setup.scrollContainer()
  setup.onLift(session.id)
  session.geometry = setup.measure()
}

function scrollDelta(session: RidgeDragSession): number {
  return session.scroller ? edgeScrollDelta(session.pointer, session.scroller.getBoundingClientRect()) : 0
}

function stopScrolling(session: RidgeDragSession) {
  if (session.scrollTimer !== null) window.clearInterval(session.scrollTimer)
  session.scrollTimer = null
}

function startedSession(event: ReactPointerEvent<HTMLElement>, id: TopbarItemId): RidgeDragSession {
  const element = event.currentTarget
  const chip = element.getBoundingClientRect()
  const origin = pointOf(event)
  return {
    id,
    element,
    origin,
    grabOffset: { x: origin.x - chip.left, y: origin.y - chip.top },
    pointer: origin,
    active: false,
    geometry: null,
    target: null,
    scroller: null,
    scrollTimer: null,
  }
}

export function useRidgeDrag(setup: RidgeDragSetup): RidgeDragControls {
  const latest = useRef(setup)
  const session = useRef<RidgeDragSession | null>(null)
  const suppressClick = useRef(false)
  const detach = useRef<() => void>(ignore)

  useLayoutEffect(() => {
    latest.current = setup
  })

  const end = useCallback((): RidgeDragSession | null => {
    const ended = session.current
    session.current = null
    detach.current()
    detach.current = ignore
    if (ended) stopScrolling(ended)
    placeCaret(latest.current.caret.current, null)
    return ended
  }, [])

  useEffect(() => () => void end(), [end])

  const cancel = useCallback(() => {
    if (end()?.active) latest.current.onCancel()
  }, [end])

  const drop = useCallback(
    (event: PointerEvent) => {
      const ended = end()
      if (!ended?.active) return
      ended.pointer = pointOf(event)
      latest.current.onDrop(ended.id, targetUnderPointer(ended))
    },
    [end]
  )

  const scrollTick = useCallback(() => {
    const current = session.current
    if (!current?.scroller) return
    const delta = scrollDelta(current)
    if (delta === 0) return stopScrolling(current)
    current.scroller.scrollTop += delta
    remeasure(current, latest.current)
  }, [])

  const follow = useCallback(
    (event: PointerEvent) => {
      const current = session.current
      if (!current) return
      current.pointer = pointOf(event)
      if (!current.active && !passedThreshold(current)) return
      if (!current.active) {
        suppressClick.current = true
        lift(current, latest.current)
      }
      placeGhost(latest.current.ghost.current, current)
      retarget(current, latest.current)
      if (current.scrollTimer === null && scrollDelta(current) !== 0) {
        current.scrollTimer = window.setInterval(scrollTick, AUTO_SCROLL_INTERVAL)
      }
    },
    [scrollTick]
  )

  const followScroll = useCallback(() => {
    const current = session.current
    if (current?.active) remeasure(current, latest.current)
  }, [])

  const cancelOnEscape = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancel()
    },
    [cancel]
  )

  const attach = useCallback(
    (element: HTMLElement) => {
      window.addEventListener('pointermove', follow)
      window.addEventListener('pointerup', drop)
      window.addEventListener('pointercancel', cancel)
      window.addEventListener('keydown', cancelOnEscape)
      window.addEventListener('blur', cancel)
      window.addEventListener('scroll', followScroll, true)
      element.addEventListener('lostpointercapture', cancel)
      return () => {
        window.removeEventListener('pointermove', follow)
        window.removeEventListener('pointerup', drop)
        window.removeEventListener('pointercancel', cancel)
        window.removeEventListener('keydown', cancelOnEscape)
        window.removeEventListener('blur', cancel)
        window.removeEventListener('scroll', followScroll, true)
        element.removeEventListener('lostpointercapture', cancel)
      }
    },
    [follow, drop, cancel, cancelOnEscape, followScroll]
  )

  const start = useCallback(
    (event: ReactPointerEvent<HTMLElement>, id: TopbarItemId) => {
      suppressClick.current = false
      if (event.button !== PRIMARY_BUTTON) return
      cancel()
      session.current = startedSession(event, id)
      event.currentTarget.setPointerCapture?.(event.pointerId)
      detach.current = attach(event.currentTarget)
    },
    [cancel, attach]
  )

  const takeSuppressedClick = useCallback(() => {
    const suppressed = suppressClick.current
    suppressClick.current = false
    return suppressed
  }, [])

  return useMemo(() => ({ start, takeSuppressedClick }), [start, takeSuppressedClick])
}

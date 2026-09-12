import { useLayoutEffect, useRef, type RefObject } from 'react'
import { calloutOffset, leaderPath, ridgeBoxWithin } from '../components/settings/ridge/ridgeGeometry'

function placeCallout(callout: HTMLElement, chip: HTMLElement): RidgeBox {
  const row = callout.parentElement ?? callout
  const offset = calloutOffset(chip.getBoundingClientRect(), row.getBoundingClientRect(), callout.offsetWidth)
  callout.style.marginLeft = `${offset}px`
  return callout.getBoundingClientRect()
}

function drawLeader(leader: SVGPathElement, chip: HTMLElement, callout: RidgeBox) {
  const drawing = leader.ownerSVGElement
  if (!drawing) return
  const frame = drawing.getBoundingClientRect()
  leader.setAttribute('d', leaderPath(ridgeBoxWithin(chip.getBoundingClientRect(), frame), ridgeBoxWithin(callout, frame)))
}

function anchorCallout(callout: HTMLElement | null, leader: SVGPathElement | null, chip: HTMLElement | null) {
  if (!callout || !chip) return
  const placed = placeCallout(callout, chip)
  if (leader) drawLeader(leader, chip, placed)
}

export function useRidgeCalloutAnchor(
  stage: RefObject<HTMLElement | null>,
  callout: RefObject<HTMLElement | null>,
  leader: RefObject<SVGPathElement | null>,
  anchor: () => HTMLElement | null
) {
  const latestAnchor = useRef(anchor)

  useLayoutEffect(() => {
    latestAnchor.current = anchor
    anchorCallout(callout.current, leader.current, anchor())
  })

  useLayoutEffect(() => {
    const observed = stage.current
    if (!observed) return
    const observer = new ResizeObserver(() => anchorCallout(callout.current, leader.current, latestAnchor.current()))
    observer.observe(observed)
    return () => observer.disconnect()
  }, [stage, callout, leader])
}

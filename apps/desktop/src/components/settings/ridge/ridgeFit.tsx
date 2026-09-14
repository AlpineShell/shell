import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { useElementWidth } from '../../../hooks/useElementWidth'
import { ridgeFitScale } from './ridgeGeometry'

const WIDTH_BEFORE_MEASURING = Number.POSITIVE_INFINITY
const CONTENT_HEADROOM = 1.08
const OVERFLOW_TOLERANCE = 0.5
const UNMEASURED: RidgeFitMeasurement = { width: 0, height: 0, floor: 0 }

function scaledFootprint(measured: RidgeFitMeasurement, scale: number): CSSProperties | undefined {
  if (measured.width === 0) return undefined
  return { width: measured.width * scale, height: measured.height * scale }
}

function widthFloor(floorWidth: number): CSSProperties {
  return floorWidth > 0 && Number.isFinite(floorWidth) ? { minWidth: floorWidth } : {}
}

function scaleTransform(scale: number): CSSProperties {
  return scale < 1 ? { transform: `scale(${scale})` } : {}
}

function measure(element: HTMLElement): RidgeFitMeasurement {
  return { width: element.offsetWidth, height: element.offsetHeight, floor: parseFloat(element.style.minWidth) || 0 }
}

function overflowsItsFloor(measured: RidgeFitMeasurement): boolean {
  return measured.width > measured.floor + OVERFLOW_TOLERANCE
}

export default function RidgeFit({ children }: RidgeFitProps) {
  const area = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const available = useElementWidth(area, WIDTH_BEFORE_MEASURING)
  const [measured, setMeasured] = useState(UNMEASURED)
  const [reference, setReference] = useState<number | null>(null)
  const floorWidth = reference === null ? 0 : Math.max(available, reference)

  useLayoutEffect(() => {
    const observed = content.current
    if (!observed) return
    const observer = new ResizeObserver(() => setMeasured(measure(observed)))
    observer.observe(observed)
    return () => observer.disconnect()
  }, [])

  if (measured.width > 0 && (reference === null || overflowsItsFloor(measured))) {
    const grown = measured.width * CONTENT_HEADROOM
    if (grown !== reference) setReference(grown)
  }

  const scale = ridgeFitScale(available, reference ?? measured.width)

  return (
    <div ref={area} className="flex w-full justify-center">
      <div style={scaledFootprint(measured, scale)}>
        <div ref={content} className="w-max origin-top-left" style={{ ...widthFloor(floorWidth), ...scaleTransform(scale) }}>
          {children}
        </div>
      </div>
    </div>
  )
}

import { useRef, useState, type CSSProperties } from 'react'
import { useElementSize } from '../../../hooks/useElementSize'
import { useElementWidth } from '../../../hooks/useElementWidth'
import { ridgeFitScale } from './ridgeGeometry'

const WIDTH_BEFORE_MEASURING = Number.POSITIVE_INFINITY
const CONTENT_HEADROOM = 1.08
const OVERFLOW_TOLERANCE = 0.5

function scaledFootprint(natural: ElementSize, scale: number): CSSProperties | undefined {
  if (natural.width === 0) return undefined
  return { width: natural.width * scale, height: natural.height * scale }
}

function widthFloor(floorWidth: number): CSSProperties {
  return floorWidth > 0 && Number.isFinite(floorWidth) ? { minWidth: floorWidth } : {}
}

function scaleTransform(scale: number): CSSProperties {
  return scale < 1 ? { transform: `scale(${scale})` } : {}
}

export default function RidgeFit({ children }: RidgeFitProps) {
  const area = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const available = useElementWidth(area, WIDTH_BEFORE_MEASURING)
  const natural = useElementSize(content)
  const [reference, setReference] = useState<number | null>(null)
  const floorWidth = reference === null ? 0 : Math.max(available, reference)

  if (natural.width > 0 && (reference === null || natural.width > floorWidth + OVERFLOW_TOLERANCE)) {
    setReference(natural.width * CONTENT_HEADROOM)
  }

  const scale = ridgeFitScale(available, reference ?? natural.width)

  return (
    <div ref={area} className="flex w-full justify-center">
      <div style={scaledFootprint(natural, scale)}>
        <div ref={content} className="w-max origin-top-left" style={{ ...widthFloor(floorWidth), ...scaleTransform(scale) }}>
          {children}
        </div>
      </div>
    </div>
  )
}

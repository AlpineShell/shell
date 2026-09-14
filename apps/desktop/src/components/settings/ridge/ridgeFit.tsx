import { useRef, type CSSProperties } from 'react'
import { useElementSize } from '../../../hooks/useElementSize'
import { useElementWidth } from '../../../hooks/useElementWidth'
import { ridgeFitScale } from './ridgeGeometry'

const WIDTH_BEFORE_MEASURING = Number.POSITIVE_INFINITY

function scaledFootprint(natural: ElementSize, scale: number): CSSProperties | undefined {
  if (natural.width === 0) return undefined
  return { width: natural.width * scale, height: natural.height * scale }
}

function fullWidthFloor(available: number): CSSProperties {
  return Number.isFinite(available) ? { minWidth: available } : {}
}

function scaleTransform(scale: number): CSSProperties {
  return scale < 1 ? { transform: `scale(${scale})` } : {}
}

export default function RidgeFit({ children }: RidgeFitProps) {
  const area = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const available = useElementWidth(area, WIDTH_BEFORE_MEASURING)
  const natural = useElementSize(content)
  const scale = ridgeFitScale(available, natural.width)

  return (
    <div ref={area} className="flex w-full justify-center">
      <div style={scaledFootprint(natural, scale)}>
        <div ref={content} className="w-max origin-top-left" style={{ ...fullWidthFloor(available), ...scaleTransform(scale) }}>
          {children}
        </div>
      </div>
    </div>
  )
}

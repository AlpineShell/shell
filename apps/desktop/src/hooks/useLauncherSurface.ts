import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { RADIUS } from '../components/topbar/chrome/chromeShape'
import { clearChromeSurface, nextSurfaceId, setChromeSurface } from '../components/topbar/chrome/chromeStore'

export function useLauncherSurface(
  panelRef: RefObject<HTMLDivElement | null>,
  bodyRef: RefObject<HTMLDivElement | null>,
  width: number,
  barBottom: number,
  reservedHeight: number
): number {
  const [surfaceId] = useState(nextSurfaceId)
  const firstLayout = useRef(true)

  useLayoutEffect(() => {
    function register() {
      const body = bodyRef.current
      const panel = panelRef.current
      if (!body || !panel) return
      const height = Math.round(body.getBoundingClientRect().height)
      if (firstLayout.current) {
        panel.style.height = `${height}px`
        panel.style.clipPath = `inset(0 0 ${height}px 0 round 0 0 ${RADIUS}px ${RADIUS}px)`
        firstLayout.current = false
      }
      setChromeSurface({
        id: surfaceId,
        centerX: Math.round(window.innerWidth / 2),
        bodyWidth: width,
        fullHeight: height,
        anchor: 'center',
        contentEl: panel,
      })
      window.launcher.reportPanelBottom(barBottom + Math.max(height, reservedHeight))
    }

    register()
    const body = bodyRef.current
    if (!body) return
    const observer = new ResizeObserver(register)
    observer.observe(body)
    window.addEventListener('resize', register)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', register)
    }
  }, [panelRef, bodyRef, width, barBottom, reservedHeight, surfaceId])

  useEffect(() => {
    const offStartClose = window.launcher.onStartClose(() => clearChromeSurface(surfaceId))
    return () => {
      offStartClose()
      clearChromeSurface(surfaceId)
    }
  }, [surfaceId])

  return surfaceId
}

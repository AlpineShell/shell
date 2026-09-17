import { useLayoutEffect, type RefObject } from 'react'

export function useFitSetupWindow(frame: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const element = frame.current
    if (!element) return
    const observer = new ResizeObserver(() => window.setup.fitWindowHeight(element.offsetHeight))
    observer.observe(element)
    return () => observer.disconnect()
  }, [frame])
}

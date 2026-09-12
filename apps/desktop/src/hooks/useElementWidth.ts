import { useLayoutEffect, useState, type RefObject } from 'react'

function latestWidth(entries: ResizeObserverEntry[]): number {
  return entries.at(-1)?.contentRect.width ?? 0
}

export function useElementWidth(element: RefObject<HTMLElement | null>, widthBeforeMeasuring: number): number {
  const [width, setWidth] = useState(widthBeforeMeasuring)

  useLayoutEffect(() => {
    const observed = element.current
    if (!observed) return
    const observer = new ResizeObserver((entries) => {
      const measured = latestWidth(entries)
      if (measured > 0) setWidth(measured)
    })
    observer.observe(observed)
    return () => observer.disconnect()
  }, [element])

  return width
}

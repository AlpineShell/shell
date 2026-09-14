import { useLayoutEffect, useState, type RefObject } from 'react'

const UNMEASURED: ElementSize = { width: 0, height: 0 }

function latestSize(entries: ResizeObserverEntry[]): ElementSize {
  const rect = entries.at(-1)?.contentRect
  return rect ? { width: rect.width, height: rect.height } : UNMEASURED
}

export function useElementSize(element: RefObject<HTMLElement | null>): ElementSize {
  const [size, setSize] = useState(UNMEASURED)

  useLayoutEffect(() => {
    const observed = element.current
    if (!observed) return
    const observer = new ResizeObserver((entries) => setSize(latestSize(entries)))
    observer.observe(observed)
    return () => observer.disconnect()
  }, [element])

  return size
}

import { useEffect, type RefObject } from 'react'

function holds(container: HTMLElement | null, target: EventTarget | null): boolean {
  return container !== null && target instanceof Node && container.contains(target)
}

export function useOutsidePointer(container: RefObject<HTMLElement | null>, active: boolean, onOutside: () => void) {
  useEffect(() => {
    if (!active) return
    function handlePointerDown(event: PointerEvent) {
      if (!holds(container.current, event.target)) onOutside()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [container, active, onOutside])
}

import { useSyncExternalStore } from "react"
import { getSurface, subscribeSurface } from "../components/topbar/engine/surfaceStore"

export function useSurfaceSuperseded(id: number): boolean {
  const activeId = useSyncExternalStore(subscribeSurface, () => {
    const surface = getSurface()
    return surface ? surface.id : 0
  })
  return activeId !== 0 && activeId !== id
}

import { useSyncExternalStore } from "react"
import { getChromeSurface, subscribeChromeSurface } from "../components/topbar/chrome/chromeStore"

export function useSurfaceSuperseded(id: number): boolean {
  const activeId = useSyncExternalStore(subscribeChromeSurface, () => {
    const surface = getChromeSurface()
    return surface ? surface.id : 0
  })
  return activeId !== 0 && activeId !== id
}

import { useEffect, useState } from 'react'

export function useTiling() {
  const [config, setConfigState] = useState<TilingConfig>({
    enabled: false,
    mode: 'snap',
    gap: 8,
    margin: 0,
    hotkeys: true,
    dragToZone: false,
    dynamicLayout: 'bsp',
    ratios: {},
    handleOversized: true,
    centerOversized: false,
  })

  useEffect(() => {
    window.shell?.tiling?.config?.()?.then?.(setConfigState)
    window.shell?.tiling?.onConfigChanged?.(setConfigState)
  }, [])

  const setConfig = (partial: Partial<TilingConfig>) => {
    setConfigState((c) => ({ ...c, ...partial }))
    window.shell?.tiling?.setConfig?.(partial)
  }

  return { config, setConfig }
}

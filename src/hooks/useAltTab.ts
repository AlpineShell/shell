import { useState, useEffect } from 'react'

export function useAltTab() {
  const [windows, setWindows] = useState<AltTabWindow[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    window.alttab.onShow((data) => {
      setWindows(data.windows)
      setSelectedIndex(data.selectedIndex)
      setVisible(true)
    })

    window.alttab.onHide(() => {
      setVisible(false)
      setWindows([])
      setSelectedIndex(0)
    })

    window.alttab.onSelectionChanged((index) => {
      setSelectedIndex(index)
    })
  }, [])

  return { windows, selectedIndex, visible }
}

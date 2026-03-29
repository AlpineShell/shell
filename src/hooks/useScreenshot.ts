import { useState, useEffect } from 'react'

export function useScreenshot() {
  const [image, setImage] = useState<string | null>(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    window.screenshot.onShow((data) => {
      setImage(data.image)
      setDimensions({ width: data.width, height: data.height })
      setVisible(true)
    })

    window.screenshot.onHide(() => {
      setVisible(false)
      setImage(null)
    })
  }, [])

  return { image, dimensions, visible }
}

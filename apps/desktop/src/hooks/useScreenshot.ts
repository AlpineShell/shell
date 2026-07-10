import { useState, useEffect } from 'react'

export function useScreenshot() {
  const [image, setImage] = useState<string | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    window.screenshot.onShow((data) => {
      setImage(data.image)
      setVisible(true)
    })

    window.screenshot.onHide(() => {
      setVisible(false)
      setImage(null)
    })

    window.screenshot.ready()
  }, [])

  return { image, visible }
}

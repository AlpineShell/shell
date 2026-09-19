import { useLayoutEffect } from 'react'

export function usePaperPalette() {
  useLayoutEffect(() => {
    const root = document.documentElement
    root.dataset.palette = 'paper'
    root.dataset.theme = 'light'
  }, [])
}

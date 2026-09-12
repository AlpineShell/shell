import { useEffect } from 'react'
import { useShellState } from './useShellState'

export function useTheme(): ThemeState {
  const theme = useShellState<ThemeState>(
    window.shell.theme.initial,
    () => window.shell.theme.get(),
    (callback) => window.shell.theme.onChanged(callback)
  )

  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = theme.name
    root.style.setProperty('--alpine-ground', theme.background)
  }, [theme.name, theme.background])

  return theme
}

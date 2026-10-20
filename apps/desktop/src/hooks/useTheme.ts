import { useEffect } from 'react'
import { useShellState } from './useShellState'

export function useTheme(): ThemeState {
  const theme = useShellState<ThemeState>(
    window.shell.theme.initial,
    () => window.shell.theme.get(),
    (callback) => window.shell.theme.onChanged(callback)
  )

  useEffect(() => {
    document.documentElement.dataset.theme = theme.name
  }, [theme.name])

  useEffect(() => {
    document.documentElement.style.setProperty('--alpine-ground', theme.background)
  }, [theme.background])

  return theme
}

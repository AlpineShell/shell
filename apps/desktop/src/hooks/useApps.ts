import { useShellState } from './useShellState'

const NO_APPS: LauncherItem[] = []

export function useApps(): LauncherItem[] {
  return useShellState(NO_APPS, window.shell.apps.catalog, window.shell.apps.onCatalogChanged)
}

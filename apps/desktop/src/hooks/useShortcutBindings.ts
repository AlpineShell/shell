import { useShellState } from './useShellState'

const NO_BINDINGS: ShortcutBinding[] = []

export function useShortcutBindings(): ShortcutBinding[] {
  return useShellState<ShortcutBinding[]>(NO_BINDINGS, window.shell.shortcuts.list, window.shell.shortcuts.onChanged)
}

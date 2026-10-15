import { useShellState } from './useShellState'

const NO_ENTRIES: ClipboardHistoryEntry[] = []

export function useClipboardHistory(): ClipboardHistoryEntry[] {
  return useShellState(NO_ENTRIES, window.clipboardHistory.entries, window.clipboardHistory.onChanged)
}

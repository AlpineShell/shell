export const SEARCH_SHORTCUTS: ShortcutGroup = {
  title: 'Search',
  shortcuts: [
    { label: 'Clipboard history', binding: 'openClipboardHistory' },
    { label: 'Emoji', binding: 'openEmojiPicker' },
  ],
}

export const APP_SHORTCUTS: ShortcutGroup = {
  title: 'Apps',
  shortcuts: [
    { label: 'Settings', binding: 'openSettings' },
    { label: 'File Explorer', binding: 'openFileExplorer' },
    { label: 'Screenshot', binding: 'takeScreenshot' },
  ],
}

export const WINDOW_SHORTCUTS: ShortcutGroup = {
  title: 'Windows',
  shortcuts: [
    { label: 'Switch windows', keys: ['Alt', 'Tab'] },
    { label: 'Snap window', binding: 'snapWindow' },
    { label: 'Move to the other display', binding: 'moveToOtherDisplay' },
    { label: 'Minimize all', binding: 'minimizeAll' },
    { label: 'Restore minimized', binding: 'restoreMinimized' },
    { label: 'Display mode', binding: 'openDisplayModePicker' },
  ],
}

export const DESKTOP_SHORTCUTS: ShortcutGroup = {
  title: 'Desktops',
  shortcuts: [
    { label: 'Switch desktop', binding: 'switchDesktop' },
    { label: 'Move window to desktop', binding: 'moveWindowToDesktop' },
    { label: 'New desktop', binding: 'addDesktop' },
    { label: 'Close desktop', binding: 'closeDesktop' },
  ],
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [SEARCH_SHORTCUTS, APP_SHORTCUTS, WINDOW_SHORTCUTS, DESKTOP_SHORTCUTS]

export function shortcutLabel(id: ShortcutBindingId): string {
  for (const group of SHORTCUT_GROUPS) {
    const listing = group.shortcuts.find((shortcut) => shortcut.binding === id)
    if (listing) return listing.label
  }
  return id
}

export function refusalMessage(result: ShortcutRecordResult): string | null {
  if (result.ok || result.reason === 'cancelled' || result.reason === 'timeout') return null
  if (result.reason === 'needs-modifier') return 'Hold Win, Ctrl or Alt with the key.'
  if (result.reason === 'needs-arrow') return 'Press the modifiers with an arrow key.'
  if (result.reason === 'reserved') return 'Windows keeps that one for itself.'
  if (result.reason === 'taken' && result.takenBy) return `Already used by ${shortcutLabel(result.takenBy)}.`
  return "Couldn't save that shortcut."
}

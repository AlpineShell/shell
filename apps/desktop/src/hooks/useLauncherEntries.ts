import { useMemo } from 'react'
import { useApps } from './useApps'
import { useOpenApps } from './useOpenApps'
import { useBookmarks } from './useBookmarks'
import { useBrowserTabs } from './useBrowserTabs'
import { useLauncherShowBookmarks } from './useLauncherShowBookmarks'
import { useLauncherShowBrowserTabs } from './useLauncherShowBrowserTabs'
import { LAUNCHER_SETTINGS, settingsEntryHint } from '../settings/registry'
import { LAUNCHER_COMMANDS } from '../lib/launcher/launcherCommands'
import {
  appEntries,
  bookmarkEntries,
  commandEntries,
  settingEntries,
  tabEntries,
  windowEntries,
} from '../lib/launcher/launcherEntries'

const SETTING_ENTRIES = settingEntries(LAUNCHER_SETTINGS, settingsEntryHint)
const COMMAND_ENTRIES = commandEntries(LAUNCHER_COMMANDS)

export function useLauncherEntries(): LauncherEntry[] {
  const items = useApps()
  const openApps = useOpenApps()
  const bookmarks = useBookmarks(useLauncherShowBookmarks())
  const { tabs, meta } = useBrowserTabs(useLauncherShowBrowserTabs())

  const apps = useMemo(() => appEntries(items), [items])
  const windows = useMemo(() => windowEntries(openApps, apps), [openApps, apps])
  const browserTabs = useMemo(() => tabEntries(tabs, meta, openApps), [tabs, meta, openApps])
  const bookmarkRows = useMemo(() => bookmarkEntries(bookmarks), [bookmarks])

  return useMemo(
    () => [...windows, ...browserTabs, ...apps, ...COMMAND_ENTRIES, ...SETTING_ENTRIES, ...bookmarkRows],
    [windows, browserTabs, apps, bookmarkRows]
  )
}

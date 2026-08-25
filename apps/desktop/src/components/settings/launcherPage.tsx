import { Minus, Plus } from 'lucide-react'
import { useLauncherHotkey } from '../../hooks/useLauncherHotkey'
import { useLauncherMaxResults } from '../../hooks/useLauncherMaxResults'
import { useLauncherRecentApps } from '../../hooks/useLauncherRecentApps'
import { useLauncherShowBookmarks } from '../../hooks/useLauncherShowBookmarks'
import { useLauncherShowBrowserTabs } from '../../hooks/useLauncherShowBrowserTabs'
import PageTitle from '../ui/pageTitle'
import Section from '../ui/section'
import Row from '../ui/row'
import Toggle from '../ui/toggle'
import IconButton from '../ui/iconButton'
import HotkeyRecorder from './hotkeyRecorder'

const MIN_RESULTS = 3
const MAX_RESULTS = 8

export default function LauncherPage() {
  const { hotkey, defaultHotkey, setHotkey } = useLauncherHotkey()
  const recentApps = useLauncherRecentApps()
  const showBookmarks = useLauncherShowBookmarks()
  const showBrowserTabs = useLauncherShowBrowserTabs()
  const maxResults = useLauncherMaxResults()

  return (
    <div className="flex w-full flex-col gap-section">
      <PageTitle title="Launcher" />

      <Section title="Shortcut">
        <Row label="Open Search">
          <HotkeyRecorder value={hotkey} defaultValue={defaultHotkey} onChange={setHotkey} />
        </Row>
      </Section>

      <Section title="Results">
        <div className="flex flex-col gap-3">
          <Row label="Recent apps" description="List your most-used apps before you type.">
            <Toggle label="Recent apps" checked={recentApps} onChange={(v) => window.launcher.setRecentApps(v)} />
          </Row>
          <Row label="Browser bookmarks" description="Search bookmarks from Chromium browsers.">
            <Toggle label="Browser bookmarks" checked={showBookmarks} onChange={(v) => window.launcher.setShowBookmarks(v)} />
          </Row>
          <Row label="Open browser tabs" description="Find and switch to tabs you already have open.">
            <Toggle label="Open browser tabs" checked={showBrowserTabs} onChange={(v) => window.launcher.setShowBrowserTabs(v)} />
          </Row>
          <Row label="Maximum results">
            <div className="flex items-center gap-1.5">
              <IconButton
                label="Fewer results"
                onClick={() => window.launcher.setMaxResults(Math.max(MIN_RESULTS, maxResults - 1))}
                disabled={maxResults <= MIN_RESULTS}
              >
                <Minus size={14} />
              </IconButton>
              <span className="w-6 text-center text-sm tabular-nums text-ink-primary">{maxResults}</span>
              <IconButton
                label="More results"
                onClick={() => window.launcher.setMaxResults(Math.min(MAX_RESULTS, maxResults + 1))}
                disabled={maxResults >= MAX_RESULTS}
              >
                <Plus size={14} />
              </IconButton>
            </div>
          </Row>
        </div>
      </Section>
    </div>
  )
}

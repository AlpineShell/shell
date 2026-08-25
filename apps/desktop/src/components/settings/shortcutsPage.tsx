import { useLauncherHotkey } from '../../hooks/useLauncherHotkey'
import { useTiling } from '../../hooks/useTiling'
import PageTitle from '../ui/pageTitle'
import Section from '../ui/section'
import Row from '../ui/row'
import HotkeyRecorder from './hotkeyRecorder'

const FIXED_SHORTCUTS: ShortcutEntry[] = [
  { id: 'switcher', label: 'Switch windows', keys: 'Alt + Tab' },
  { id: 'screenshot', label: 'Screenshot', keys: 'Win + Shift + S' },
  { id: 'explorer', label: 'File Explorer', keys: 'Win + E' },
  { id: 'settings', label: 'Settings', keys: 'Win + I' },
  { id: 'emoji', label: 'Emoji picker', keys: 'Win + .' },
  { id: 'search-in-settings', label: 'Search from Settings', keys: 'Ctrl + K' },
]

export default function ShortcutsPage() {
  const { hotkey, defaultHotkey, setHotkey } = useLauncherHotkey()
  const { config } = useTiling()
  const snapActive = config.enabled && config.mode === 'snap' && config.hotkeys

  return (
    <div className="flex w-full flex-col gap-section">
      <PageTitle title="Shortcuts" />

      <Section title="Rebindable">
        <Row label="Search">
          <HotkeyRecorder value={hotkey} defaultValue={defaultHotkey} onChange={setHotkey} />
        </Row>
      </Section>

      <Section title="Fixed">
        <div className="flex flex-col gap-3">
          <Row label="Snap window" description={snapActive ? undefined : 'Off — turn on tiling snapping under Windows.'}>
            <Keys value="Win + Arrow" dimmed={!snapActive} />
          </Row>
          {FIXED_SHORTCUTS.map((entry) => (
            <Row key={entry.id} label={entry.label}>
              <Keys value={entry.keys} />
            </Row>
          ))}
        </div>
      </Section>
    </div>
  )
}

function Keys({ value, dimmed }: { value: string; dimmed?: boolean }) {
  return (
    <span
      className={`inline-flex h-8 items-center rounded-field border border-line-hairline bg-fill-subtle px-3 text-[12px] font-medium ${
        dimmed ? 'text-ink-faint' : 'text-ink-secondary'
      }`}
    >
      {value}
    </span>
  )
}

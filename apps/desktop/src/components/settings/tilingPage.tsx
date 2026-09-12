import { settingsValueEntry } from '../../settings/registry'
import { useSettingsValue } from '../../hooks/useSettingsValue'
import RegistryPage from './registryPage'

const MODE_GROUP = 'Mode'
const LAYOUT_GROUP = 'Layout'

const ENABLED = settingsValueEntry('tiling-enabled')
const MODE = settingsValueEntry('tiling-mode')
const HANDLE_OVERSIZED = settingsValueEntry('tiling-handle-oversized')
const PLACEMENT = settingsValueEntry('tiling-oversized-placement')

const SNAP_ONLY_ENTRIES = ['tiling-hotkeys', 'tiling-drag-to-zone']
const DYNAMIC_ONLY_ENTRIES = ['tiling-dynamic-layout', 'tiling-split-sizes']

const EVERYTHING_BUT_THE_SWITCH = [
  'tiling-mode',
  ...SNAP_ONLY_ENTRIES,
  ...DYNAMIC_ONLY_ENTRIES,
  'tiling-gap',
  'tiling-margin',
  'tiling-handle-oversized',
  'tiling-oversized-placement',
]

export default function TilingPage() {
  const enabled = useSettingsValue(ENABLED).value === true
  const dynamic = useSettingsValue(MODE).value === 'dynamic'
  const handleOversized = useSettingsValue(HANDLE_OVERSIZED).value === true
  const centered = useSettingsValue(PLACEMENT).value === 'center'

  return (
    <RegistryPage
      page="tiling"
      slots={enabled ? modeSlots(dynamic) : []}
      hidden={hiddenEntries(enabled, dynamic, handleOversized)}
      entryDescriptions={{
        'tiling-mode': '',
        'tiling-dynamic-layout': '',
        'tiling-oversized-placement': centered
          ? 'Float the window centered on screen.'
          : 'Align the window to its zone edge.',
      }}
    />
  )
}

function hiddenEntries(enabled: boolean, dynamic: boolean, handleOversized: boolean): string[] {
  if (!enabled) return EVERYTHING_BUT_THE_SWITCH
  const hidden = dynamic ? [...SNAP_ONLY_ENTRIES] : [...DYNAMIC_ONLY_ENTRIES]
  if (!handleOversized) hidden.push('tiling-oversized-placement')
  return hidden
}

function modeSlots(dynamic: boolean): SettingsPageSlot[] {
  const slots: SettingsPageSlot[] = [
    {
      group: MODE_GROUP,
      order: 2.5,
      content: (
        <p className="text-xs text-ink-quiet">
          {dynamic
            ? 'Automatically arranges all windows; re-tiles as windows open and close. Experimental.'
            : 'Recommended. Snap windows into halves and quarters with Win+Arrow; they stay where you put them.'}
        </p>
      ),
    },
  ]

  if (dynamic) {
    slots.push({
      group: LAYOUT_GROUP,
      order: 5.5,
      content: (
        <p className="text-xs text-ink-quiet">
          New windows tile into place instantly. Drag a tile onto another to swap their positions, or drag
          the edge between two tiles to resize the split.
        </p>
      ),
    })
  }

  return slots
}

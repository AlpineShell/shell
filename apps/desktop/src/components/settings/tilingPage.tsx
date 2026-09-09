import { useTiling } from '../../hooks/useTiling'
import RegistryPage from './registryPage'

const MODE_GROUP = 'Mode'
const LAYOUT_GROUP = 'Layout'

const SNAP_ONLY_ENTRIES = ['tiling-hotkeys', 'tiling-drag-to-zone']
const DYNAMIC_ONLY_ENTRIES = ['tiling-dynamic-layout', 'tiling-split-sizes']

const DISABLED_ENTRIES = [
  'tiling-mode',
  ...SNAP_ONLY_ENTRIES,
  ...DYNAMIC_ONLY_ENTRIES,
  'tiling-gap',
  'tiling-margin',
  'tiling-handle-oversized',
  'tiling-oversized-placement',
]

export default function TilingPage() {
  const { config } = useTiling()
  const dynamic = config.mode === 'dynamic'

  return (
    <RegistryPage
      page="tiling"
      slots={config.enabled ? modeSlots(dynamic) : []}
      hidden={hiddenEntries(config)}
      entryDescriptions={{
        'tiling-oversized-placement': config.centerOversized
          ? 'Float the window centered on screen.'
          : 'Align the window to its zone edge.',
      }}
    />
  )
}

function hiddenEntries(config: TilingConfig): string[] {
  if (!config.enabled) return DISABLED_ENTRIES
  const hidden = config.mode === 'dynamic' ? [...SNAP_ONLY_ENTRIES] : [...DYNAMIC_ONLY_ENTRIES]
  if (!config.handleOversized) hidden.push('tiling-oversized-placement')
  return hidden
}

function modeSlots(dynamic: boolean): SettingsPageSlot[] {
  const slots: SettingsPageSlot[] = [
    {
      group: MODE_GROUP,
      order: 3,
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
      order: 6,
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

import { settingsValueEntry } from '../../settings/registry'
import { useSettingsValue } from '../../hooks/useSettingsValue'
import RegistryPage from './registryPage'

const ENABLED = settingsValueEntry('tiling-enabled')
const MODE = settingsValueEntry('tiling-mode')
const HANDLE_OVERSIZED = settingsValueEntry('tiling-handle-oversized')

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

  return <RegistryPage page="tiling" hidden={hiddenEntries(enabled, dynamic, handleOversized)} />
}

function hiddenEntries(enabled: boolean, dynamic: boolean, handleOversized: boolean): string[] {
  if (!enabled) return EVERYTHING_BUT_THE_SWITCH
  const hidden = dynamic ? [...SNAP_ONLY_ENTRIES] : [...DYNAMIC_ONLY_ENTRIES]
  if (!handleOversized) hidden.push('tiling-oversized-placement')
  return hidden
}

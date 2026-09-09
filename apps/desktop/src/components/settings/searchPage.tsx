import RegistryPage from './registryPage'
import Row from '../ui/row'
import HotkeyRecorder from './hotkeyRecorder'

const HOTKEYS_GROUP = 'Hotkeys'
const SCREENSHOT_HOTKEY = 'Super+Shift+S'

export default function SearchPage() {
  const slots: SettingsPageSlot[] = [
    {
      group: HOTKEYS_GROUP,
      order: 2,
      content: (
        <Row label="Screenshot" description="Create a screenshot">
          <HotkeyRecorder value={SCREENSHOT_HOTKEY} fallback={SCREENSHOT_HOTKEY} onChange={() => {}} disabled />
        </Row>
      ),
    },
  ]

  return <RegistryPage page="search" slots={slots} />
}

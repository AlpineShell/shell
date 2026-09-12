import { LayoutGrid } from 'lucide-react'
import { useTrayIcons } from '../../hooks/useTrayIcons'
import { useTrayLayout } from '../../hooks/useTrayLayout'
import { settingsValueEntry } from '../../settings/registry'
import { useSettingsValue } from '../../hooks/useSettingsValue'
import { composeTray } from '../topbar/tray/composeTray'
import RegistryPage from './registryPage'
import NavRow from '../ui/navRow'

const ICONS_GROUP = 'Icons'

const TRAY_ENABLED = settingsValueEntry('tray-enabled')

export default function TrayPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  const icons = useTrayIcons()
  const { layout } = useTrayLayout()
  const enabled = useSettingsValue(TRAY_ENABLED).value === true
  const { visible, overflow } = composeTray(icons, layout)

  const slots: SettingsPageSlot[] = enabled
    ? [
        {
          group: ICONS_GROUP,
          order: 3,
          content: (
            <NavRow
              onClick={() => onNavigate('tray/icons')}
              icon={<LayoutGrid size={18} />}
              label="Manage icons"
              description={`Reorder, show and hide tray icons · ${visible.length} shown, ${overflow.length} hidden`}
            />
          ),
        },
      ]
    : []

  return (
    <RegistryPage
      page="tray"
      slots={slots}
      hidden={enabled ? [] : ['tray-overflow', 'tray-all-monitors']}
    />
  )
}

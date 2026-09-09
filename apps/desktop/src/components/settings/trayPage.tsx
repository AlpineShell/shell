import { LayoutGrid } from 'lucide-react'
import { useTrayIcons } from '../../hooks/useTrayIcons'
import { useTrayLayout } from '../../hooks/useTrayLayout'
import { useTraySettings } from '../../hooks/useTraySettings'
import { composeTray } from '../topbar/tray/composeTray'
import RegistryPage from './registryPage'
import NavRow from '../ui/navRow'

const ICONS_GROUP = 'Icons'

export default function TrayPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  const icons = useTrayIcons()
  const { layout } = useTrayLayout()
  const { settings } = useTraySettings()
  const { visible, overflow } = composeTray(icons, layout)

  const slots: SettingsPageSlot[] = settings.enabled
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
      hidden={settings.enabled ? [] : ['tray-overflow', 'tray-all-monitors']}
    />
  )
}

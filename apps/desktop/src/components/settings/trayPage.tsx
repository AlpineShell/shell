import { LayoutGrid } from 'lucide-react'
import { useTrayIcons } from '../../hooks/useTrayIcons'
import { useTrayLayout } from '../../hooks/useTrayLayout'
import { useTrayDisplay } from '../../hooks/useTrayDisplay'
import { useTraySettings } from '../../hooks/useTraySettings'
import { composeTray } from '../topbar/tray/composeTray'
import PageTitle from '../ui/pageTitle'
import Section from '../ui/section'
import Row from '../ui/row'
import Toggle from '../ui/toggle'
import NavRow from '../ui/navRow'

export default function TrayPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  const icons = useTrayIcons()
  const { layout } = useTrayLayout()
  const { display, setShowOnAllMonitors } = useTrayDisplay()
  const { settings, setSettings } = useTraySettings()
  const { visible, overflow } = composeTray(icons, layout)

  return (
    <div className="flex w-full flex-col gap-section">
      <PageTitle title="System Tray" />

      <Section title="General">
        <div className="flex flex-col gap-3">
          <Row label="Show system tray" description="Display running apps' tray icons in the top bar.">
            <Toggle
              label="Show system tray"
              checked={settings.enabled}
              onChange={(v) => setSettings({ enabled: v })}
            />
          </Row>
          {settings.enabled && (
            <Row
              label="Show overflow arrow"
              description="Show the chevron that holds hidden icons. When off, the arrow is hidden and hidden icons are managed only here."
            >
              <Toggle
                label="Show overflow arrow"
                checked={settings.showOverflow}
                onChange={(v) => setSettings({ showOverflow: v })}
              />
            </Row>
          )}
        </div>
      </Section>

      {settings.enabled && (
        <>
          <Section title="Icons">
            <NavRow
              onClick={() => onNavigate('personalization/tray/icons')}
              icon={<LayoutGrid size={18} />}
              label="Manage icons"
              description={`Reorder, show and hide tray icons · ${visible.length} shown, ${overflow.length} hidden`}
            />
          </Section>

          <Section title="Monitors">
            <Row
              label="Show on all monitors"
              description="Mirror the tray on every display's top bar. When off, it appears only on your primary display."
            >
              <Toggle
                label="Show on all monitors"
                checked={display.showOnAllMonitors}
                onChange={setShowOnAllMonitors}
              />
            </Row>
          </Section>
        </>
      )}
    </div>
  )
}

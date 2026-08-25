import { ChevronDown, ChevronUp, Eye, EyeOff } from 'lucide-react'
import { useTrayIcons } from '../../hooks/useTrayIcons'
import { useTrayLayout } from '../../hooks/useTrayLayout'
import { useTrayDisplay } from '../../hooks/useTrayDisplay'
import { useTraySettings } from '../../hooks/useTraySettings'
import { composeTray } from '../topbar/tray/composeTray'
import Section from '../ui/section'
import Row from '../ui/row'
import Toggle from '../ui/toggle'
import IconButton from '../ui/iconButton'
import Card from '../ui/card'

export default function TopBarTraySection() {
  const icons = useTrayIcons()
  const { layout, setLayout } = useTrayLayout()
  const { display, setShowOnAllMonitors } = useTrayDisplay()
  const { settings, setSettings } = useTraySettings()
  const { visible, overflow } = composeTray(icons, layout)

  function commit(visibleIds: string[], hidden: string[]) {
    setLayout({ order: [...visibleIds, ...overflow.map((i) => i.id).filter((id) => !visibleIds.includes(id))], hidden })
  }

  function move(id: string, dir: -1 | 1) {
    const ids = visible.map((i) => i.id)
    const idx = ids.indexOf(id)
    const swap = idx + dir
    if (swap < 0 || swap >= ids.length) return
    ;[ids[idx], ids[swap]] = [ids[swap], ids[idx]]
    commit(ids, layout.hidden)
  }

  function hide(id: string) {
    commit(visible.map((i) => i.id), layout.hidden.includes(id) ? layout.hidden : [...layout.hidden, id])
  }

  function show(id: string) {
    commit([...visible.map((i) => i.id), id], layout.hidden.filter((h) => h !== id))
  }

  return (
    <Section title="System tray">
      <div className="flex flex-col gap-3">
        <Row label="Show system tray" description="Running apps' tray icons in the bar.">
          <Toggle label="Show system tray" checked={settings.enabled} onChange={(v) => setSettings({ enabled: v })} />
        </Row>

        {settings.enabled && (
          <>
            <Row label="Overflow arrow" description="The chevron that holds hidden icons.">
              <Toggle
                label="Overflow arrow"
                checked={settings.showOverflow}
                onChange={(v) => setSettings({ showOverflow: v })}
              />
            </Row>
            <Row label="Show on all monitors" description="Off shows the tray only on your primary display.">
              <Toggle label="Show on all monitors" checked={display.showOnAllMonitors} onChange={setShowOnAllMonitors} />
            </Row>

            {icons.length === 0 ? (
              <p className="text-xs text-ink-quiet">No tray icons are running.</p>
            ) : (
              <div className="flex flex-col gap-1">
                {visible.map((icon, i) => (
                  <TrayIconRow key={icon.id} icon={icon}>
                    <IconButton label="Move up" disabled={i === 0} onClick={() => move(icon.id, -1)}>
                      <ChevronUp size={15} />
                    </IconButton>
                    <IconButton label="Move down" disabled={i === visible.length - 1} onClick={() => move(icon.id, 1)}>
                      <ChevronDown size={15} />
                    </IconButton>
                    <IconButton label="Hide" onClick={() => hide(icon.id)}>
                      <EyeOff size={15} />
                    </IconButton>
                  </TrayIconRow>
                ))}
                {overflow.map((icon) => (
                  <TrayIconRow key={icon.id} icon={icon} dimmed>
                    <IconButton label="Show" onClick={() => show(icon.id)}>
                      <Eye size={15} />
                    </IconButton>
                  </TrayIconRow>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </Section>
  )
}

function TrayIconRow({ icon, dimmed, children }: { icon: TrayIcon; dimmed?: boolean; children: React.ReactNode }) {
  return (
    <Card className={`flex h-11 items-center gap-3 px-3 ${dimmed ? 'opacity-60' : ''}`}>
      {icon.icon ? (
        <img src={icon.icon} alt="" className="h-5 w-5 shrink-0" draggable={false} />
      ) : (
        <div className="h-5 w-5 shrink-0 rounded bg-surface-3" />
      )}
      <span className="min-w-0 flex-1 truncate text-dense text-ink-primary">{icon.tooltip || 'Tray icon'}</span>
      <div className="flex shrink-0 items-center gap-1">{children}</div>
    </Card>
  )
}

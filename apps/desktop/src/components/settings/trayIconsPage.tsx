import { ChevronDown, ChevronUp, Eye, EyeOff } from 'lucide-react'
import { useTrayIcons } from '../../hooks/useTrayIcons'
import { useTrayLayout } from '../../hooks/useTrayLayout'
import { composeTray } from '../topbar/tray/composeTray'
import PageTitle from '../ui/pageTitle'
import Section from '../ui/section'
import IconButton from '../ui/iconButton'
import Card from '../ui/card'

export default function TrayIconsPage() {
  const icons = useTrayIcons()
  const { layout, setLayout } = useTrayLayout()
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
    <div className="flex w-full flex-col gap-section">
      <PageTitle title="Tray Icons" />

      {icons.length === 0 && (
        <p className="text-sm text-ink-quiet">No tray icons are currently running. App icons appear here once their apps add them to the notification area.</p>
      )}

      {visible.length > 0 && (
        <Section title="Shown" subtitle="Icons displayed in the top bar. Reorder them or move them to the hidden area.">
          <div className="flex flex-col gap-1">
            {visible.map((icon, i) => (
              <Row key={icon.id} icon={icon}>
                <IconButton label="Move up" disabled={i === 0} onClick={() => move(icon.id, -1)}>
                  <ChevronUp size={15} />
                </IconButton>
                <IconButton label="Move down" disabled={i === visible.length - 1} onClick={() => move(icon.id, 1)}>
                  <ChevronDown size={15} />
                </IconButton>
                <IconButton label="Hide" onClick={() => hide(icon.id)}>
                  <EyeOff size={15} />
                </IconButton>
              </Row>
            ))}
          </div>
        </Section>
      )}

      {overflow.length > 0 && (
        <Section title="Hidden" subtitle="Icons tucked into the overflow flyout.">
          <div className="flex flex-col gap-1">
            {overflow.map((icon) => (
              <Row key={icon.id} icon={icon}>
                <IconButton label="Show" onClick={() => show(icon.id)}>
                  <Eye size={15} />
                </IconButton>
              </Row>
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}

function Row({ icon, children }: { icon: TrayIcon; children: React.ReactNode }) {
  return (
    <Card className="flex h-11 items-center gap-3 px-3">
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

import { ChevronDown, ChevronUp, Eye, EyeOff } from 'lucide-react'
import { useTrayIcons } from '../../hooks/useTrayIcons'
import { useTrayLayout } from '../../hooks/useTrayLayout'
import { composeTray } from '../topbar/tray/composeTray'

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
    <div className="flex flex-col gap-8 w-full">
      <h1 className="text-2xl font-semibold tracking-tight">Tray Icons</h1>

      {icons.length === 0 && (
        <p className="text-sm text-white/50">No tray icons are currently running. App icons appear here once their apps add them to the notification area.</p>
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
    <div className="flex items-center gap-3 px-3 h-11 rounded-lg bg-neutral-900 border border-white/5">
      {icon.icon ? (
        <img src={icon.icon} alt="" className="w-5 h-5 shrink-0" draggable={false} />
      ) : (
        <div className="w-5 h-5 shrink-0 rounded bg-white/10" />
      )}
      <span className="text-[13px] text-white/90 flex-1 min-w-0 truncate">{icon.tooltip || 'Tray icon'}</span>
      <div className="flex items-center gap-1 shrink-0">{children}</div>
    </div>
  )
}

function IconButton({ children, label, onClick, disabled }: { children: React.ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors ${
        disabled ? 'text-white/20 cursor-not-allowed' : 'text-white/70 hover:text-white hover:bg-white/10 cursor-pointer'
      }`}
    >
      {children}
    </button>
  )
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {subtitle && <p className="text-xs text-white/50 mt-1">{subtitle}</p>}
      </div>
      {children}
    </section>
  )
}

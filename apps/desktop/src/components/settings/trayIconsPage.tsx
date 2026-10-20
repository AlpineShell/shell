import type { ReactNode } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { Button, Card, EmptyState, IconButton, ListRow, PageTitle, Section } from '@alpine/ui'
import { settingsPage } from '../../settings/registry'
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
    <div className="flex w-full flex-col gap-section">
      <PageTitle variant="plain" title={settingsPage('tray-icons')?.label ?? ''} />

      {icons.length === 0 ? (
        <EmptyState variant="plain" title="No tray icons running" />
      ) : (
        <>
          <Section variant="label" title="Shown">
            <TrayList empty="No shown icons">
              {visible.map((icon, i) => (
                <TrayRow key={icon.id} icon={icon}>
                  <IconButton label={`Move ${icon.tooltip} up`} disabled={i === 0} onClick={() => move(icon.id, -1)}>
                    <ArrowUp size={14} />
                  </IconButton>
                  <IconButton
                    label={`Move ${icon.tooltip} down`}
                    disabled={i === visible.length - 1}
                    onClick={() => move(icon.id, 1)}
                  >
                    <ArrowDown size={14} />
                  </IconButton>
                  <Button shape="square" variant="soft" size="sm" onClick={() => hide(icon.id)}>
                    Hide
                  </Button>
                </TrayRow>
              ))}
            </TrayList>
          </Section>

          <Section variant="label" title="Hidden">
            <TrayList empty="No hidden icons">
              {overflow.map((icon) => (
                <TrayRow key={icon.id} icon={icon}>
                  <Button shape="square" variant="soft" size="sm" onClick={() => show(icon.id)}>
                    Show
                  </Button>
                </TrayRow>
              ))}
            </TrayList>
          </Section>
        </>
      )}
    </div>
  )
}

function TrayList({ empty, children }: { empty: string; children: ReactNode[] }) {
  return (
    <Card variant="list">
      {children.length > 0 ? children : <p className="px-3 py-3 text-dense text-ink-quiet">{empty}</p>}
    </Card>
  )
}

function TrayRow({ icon, children }: { icon: TrayIcon; children: ReactNode }) {
  return (
    <ListRow
      variant="plain"
      icon={icon.icon ? <img src={icon.icon} alt="" className="h-5 w-5" draggable={false} /> : undefined}
      title={icon.tooltip}
      actions={children}
    />
  )
}

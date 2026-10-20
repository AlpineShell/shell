import { useState } from 'react'
import { AppWindow, Boxes, FolderOpen, Search, SquareArrowOutUpRight, Trash2 } from 'lucide-react'
import { Avatar, Button, Card, ConfirmButton, EmptyState, ListRow, PageHeader, TextField } from '@alpine/ui'
import { settingsPage } from '../../settings/registry'
import { useInstalledApps } from '../../hooks/useInstalledApps'
import { ROW_ACTIONS } from './appsShared'
import PageSpinner from './pageSpinner'

type InstalledAction = 'open' | 'locate' | 'uninstall'

export default function AppsInstalledPage() {
  const installed = useInstalledApps()
  const [query, setQuery] = useState('')
  const [componentsOpen, setComponentsOpen] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  function toggleRow(id: string) {
    setOpenId((current) => (current === id ? null : id))
  }

  const q = query.trim().toLowerCase()
  const apps = q
    ? installed.filter((a) => a.name.toLowerCase().includes(q) || (a.publisher || '').toLowerCase().includes(q))
    : installed
  const userApps = apps.filter((a) => !a.isComponent)
  const components = apps.filter((a) => a.isComponent)
  const showComponents = componentsOpen || q.length > 0

  return (
    <div className="flex w-full flex-col gap-5">
      <PageHeader variant="plain" title={settingsPage('apps-installed')?.label ?? ''}>
        <TextField
          label="Search installed apps"
          value={query}
          onChange={setQuery}
          placeholder="Search for an app"
          icon={<Search size={13} />}
          className="w-56"
        />
      </PageHeader>

      {installed.length === 0 && <PageSpinner label="Looking for installed apps" />}
      {installed.length > 0 && apps.length === 0 && <EmptyState variant="plain" title="No apps match your search." />}

      {userApps.length > 0 && (
        <Card variant="list">
          {userApps.map((app) => (
            <InstalledRow key={app.id} app={app} open={openId === app.id} onToggle={() => toggleRow(app.id)} />
          ))}
        </Card>
      )}

      {components.length > 0 && (
        <Card variant="list">
          <ListRow
            variant="plain"
            icon={<Boxes size={16} className="text-ink-faint" />}
            title={`Components & dependencies · ${components.length}`}
            muted
            onActivate={() => setComponentsOpen((v) => !v)}
            expanded={showComponents}
          />
          {showComponents &&
            components.map((app) => (
              <InstalledRow key={app.id} app={app} open={openId === app.id} onToggle={() => toggleRow(app.id)} />
            ))}
        </Card>
      )}
    </div>
  )
}

function canActOn(app: InstalledApp): boolean {
  return app.canOpen || app.canOpenLocation || app.canUninstall
}

function InstalledRow({ app, open, onToggle }: { app: InstalledApp; open: boolean; onToggle: () => void }) {
  const [pending, setPending] = useState<InstalledAction | null>(null)
  const actionable = canActOn(app)

  async function act(kind: InstalledAction, run: () => Promise<unknown>) {
    if (pending) return
    setPending(kind)
    try { await run() } finally { setPending(null) }
  }

  return (
    <ListRow
      variant="plain"
      icon={<Avatar src={app.icon} alt={app.name} fallback={<AppWindow size={16} strokeWidth={1.75} />} />}
      title={app.name}
      detail={app.publisher || undefined}
      onActivate={actionable ? onToggle : undefined}
      activateLabel={app.name}
      expanded={actionable ? open : undefined}
    >
      {open && actionable && (
        <div className={ROW_ACTIONS}>
          {app.canOpen && (
            <Button
              shape="square"
              variant="soft"
              size="sm"
              icon={<SquareArrowOutUpRight size={14} />}
              disabled={!!pending}
              busy={pending === 'open'}
              onClick={() => act('open', () => window.shell.apps.openApp(app.id))}
            >
              Open
            </Button>
          )}
          {app.canOpenLocation && (
            <Button
              shape="square"
              variant="soft"
              size="sm"
              icon={<FolderOpen size={14} />}
              disabled={!!pending}
              busy={pending === 'locate'}
              onClick={() => act('locate', () => window.shell.apps.openAppLocation(app.id))}
            >
              Open file location
            </Button>
          )}
          {app.canUninstall && (
            <ConfirmButton
              shape="square"
              variant="dangerSoft"
              confirmVariant="danger"
              label="Uninstall"
              confirmLabel={`Uninstall ${app.name}`}
              icon={<Trash2 size={14} />}
              disabled={!!pending}
              busy={pending === 'uninstall'}
              onConfirm={() => act('uninstall', () => window.shell.apps.uninstall(app.id))}
            />
          )}
        </div>
      )}
    </ListRow>
  )
}

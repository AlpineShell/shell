import { useState } from 'react'
import { AppWindow, Boxes, FolderOpen, Search, SquareArrowOutUpRight, Trash2 } from 'lucide-react'
import { Avatar, ConfirmButton, EmptyState, IconButton, ListRow, PageHeader, TextField } from '@alpine/ui'
import { settingsPage } from '../../settings/registry'
import { useInstalledApps } from '../../hooks/useInstalledApps'
import PageSpinner from './pageSpinner'

type InstalledAction = 'open' | 'locate' | 'uninstall'

export default function AppsInstalledPage() {
  const installed = useInstalledApps()
  const [query, setQuery] = useState('')
  const [componentsOpen, setComponentsOpen] = useState(false)

  const q = query.trim().toLowerCase()
  const apps = q
    ? installed.filter((a) => a.name.toLowerCase().includes(q) || (a.publisher || '').toLowerCase().includes(q))
    : installed
  const userApps = apps.filter((a) => !a.isComponent)
  const components = apps.filter((a) => a.isComponent)
  const showComponents = componentsOpen || q.length > 0

  return (
    <div className="flex w-full flex-col gap-5">
      <PageHeader title={settingsPage('apps-installed')?.label ?? ''}>
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

      <div className="flex flex-col">
        {userApps.map((app) => (
          <InstalledRow key={app.id} app={app} />
        ))}

        {components.length > 0 && (
          <div className="mt-3">
            <ListRow
              variant="plain"
              icon={<Boxes size={16} className="text-ink-faint" />}
              title={`Components & dependencies · ${components.length}`}
              muted
              onActivate={() => setComponentsOpen((v) => !v)}
              expanded={showComponents}
            />
          </div>
        )}

        {showComponents && components.map((app) => <InstalledRow key={app.id} app={app} />)}
      </div>
    </div>
  )
}

function InstalledRow({ app }: { app: InstalledApp }) {
  const [pending, setPending] = useState<InstalledAction | null>(null)

  async function act(kind: InstalledAction, run: () => Promise<unknown>) {
    if (pending) return
    setPending(kind)
    try { await run() } finally { setPending(null) }
  }

  return (
    <ListRow
      variant="plain"
      revealActions
      icon={<Avatar src={app.icon} alt={app.name} fallback={<AppWindow size={16} strokeWidth={1.75} />} />}
      title={app.name}
      detail={app.publisher || undefined}
      actions={
        <>
          {app.canOpen && (
            <IconButton
              label="Open"
              onClick={() => act('open', () => window.shell.apps.openApp(app.id))}
              disabled={!!pending}
              busy={pending === 'open'}
            >
              <SquareArrowOutUpRight size={14} />
            </IconButton>
          )}
          {app.canOpenLocation && (
            <IconButton
              label="Open file location"
              onClick={() => act('locate', () => window.shell.apps.openAppLocation(app.id))}
              disabled={!!pending}
              busy={pending === 'locate'}
            >
              <FolderOpen size={14} />
            </IconButton>
          )}
          {app.canUninstall && (
            <ConfirmButton
              label="Uninstall"
              confirmLabel={`Uninstall ${app.name}`}
              onConfirm={() => act('uninstall', () => window.shell.apps.uninstall(app.id))}
              disabled={!!pending}
              busy={pending === 'uninstall'}
              icon={<Trash2 size={14} />}
              iconOnly
              confirmOnly
            />
          )}
        </>
      }
    />
  )
}

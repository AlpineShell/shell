import { useState } from 'react'
import { ExternalLink, FileType } from 'lucide-react'
import { useFileHandlers } from '../../hooks/useFileHandlers'
import Badge from '../ui/badge'
import Button from '../ui/button'
import EmptyState from '../ui/emptyState'
import ListRow from '../ui/listRow'
import PageHeader from '../ui/pageHeader'
import Spinner from '../ui/spinner'

export default function AppsDefaultsPage() {
  const { handlers, loading, refresh } = useFileHandlers()
  const [opening, setOpening] = useState(false)

  async function openWindowsDefaults() {
    setOpening(true)
    try {
      await window.fileHandlers.chooseDefault()
      await refresh()
    } finally {
      setOpening(false)
    }
  }

  return (
    <div className="flex w-full flex-col gap-5">
      <PageHeader
        title="Default apps"
        subtitle="File types your plugins can open. Windows decides which app actually opens each one."
      >
        <Button variant="outline" size="sm" onClick={openWindowsDefaults} busy={opening} icon={<ExternalLink size={14} />}>
          Open Windows settings
        </Button>
      </PageHeader>

      <div className="flex flex-col gap-1">
        {loading && <EmptyState icon={<Spinner size={20} />} title="Looking for file types…" />}
        {!loading && handlers.length === 0 && (
          <EmptyState
            icon={<FileType size={20} />}
            title="No plugin claims a file type yet."
            detail="Install a plugin that opens files and the types it handles show up here."
          />
        )}

        {handlers.map((handler) => (
          <FileTypeRow key={handler.extension} handler={handler} />
        ))}
      </div>
    </div>
  )
}

function FileTypeRow({ handler }: { handler: FileHandlerState }) {
  return (
    <ListRow
      icon={<FileType size={16} className="text-ink-faint" />}
      title={handler.extension}
      badges={handler.isDefault && <Badge tone="success">Default</Badge>}
      detail={<FileTypeDetail handler={handler} />}
    />
  )
}

function FileTypeDetail({ handler }: { handler: FileHandlerState }) {
  if (handler.isDefault) return <>{handler.pluginName} opens these files.</>
  if (!handler.holder) return <>{handler.pluginName} can open these files. Nothing on your PC opens them yet.</>
  return (
    <>
      {handler.pluginName} can open these files. Windows opens them with{' '}
      <span className="font-mono">{handler.holder}</span>.
    </>
  )
}

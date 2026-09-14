import { FileType } from 'lucide-react'
import { Badge, EmptyState, ListRow, PageHeader, Spinner } from '@alpine/ui'
import { useFileHandlers } from '../../hooks/useFileHandlers'

export default function AppsDefaultsPage() {
  const { handlers, loading } = useFileHandlers()

  return (
    <div className="flex w-full flex-col gap-5">
      <PageHeader title="Default apps" />

      <div className="flex flex-col gap-1">
        {loading && <EmptyState variant="plain" icon={<Spinner size={14} />} title="Looking for file types…" />}
        {!loading && handlers.length === 0 && (
          <EmptyState variant="plain" title="No plugin opens a file type yet." />
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
      variant="plain"
      icon={<FileType size={16} className="text-ink-faint" />}
      title={handler.extension}
      badges={handler.isDefault && <Badge tone="success">Default</Badge>}
      detail={<FileTypeDetail handler={handler} />}
    />
  )
}

function FileTypeDetail({ handler }: { handler: FileHandlerState }) {
  if (handler.isDefault || !handler.holder) return <>{handler.pluginName}</>
  return <span className="font-mono">{handler.holder}</span>
}

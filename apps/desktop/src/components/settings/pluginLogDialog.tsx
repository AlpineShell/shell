import { useEffect, useState } from 'react'
import { Copy, Trash2 } from 'lucide-react'
import { Button, Dialog } from '@alpine/ui'

const SOURCE_WIDTH = 'w-16'

function timeOf(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

function asText(lines: PluginLogLine[]): string {
  return lines.map((line) => `${timeOf(line.at)}  ${line.source.padEnd(8)}  ${line.message}`).join('\n')
}

function usePluginLog(pluginId: string, open: boolean) {
  const [lines, setLines] = useState<PluginLogLine[]>([])

  useEffect(() => {
    if (!open) return
    let alive = true
    window.plugins.logs(pluginId).then((next) => {
      if (alive) setLines(next)
    })
    return () => {
      alive = false
    }
  }, [pluginId, open])

  const clear = async () => {
    await window.plugins.clearLogs(pluginId)
    setLines([])
  }

  return { lines, clear }
}

function LogLine({ line }: { line: PluginLogLine }) {
  const error = line.level === 'error'
  return (
    <li className="flex gap-3 whitespace-pre-wrap">
      <span className="shrink-0 text-ink-faint tabular-nums">{timeOf(line.at)}</span>
      <span className={`${SOURCE_WIDTH} shrink-0 ${error ? 'text-danger' : 'text-ink-quiet'}`}>{line.source}</span>
      <span className={`min-w-0 break-words ${error ? 'text-danger' : 'text-ink-primary'}`}>{line.message}</span>
    </li>
  )
}

export default function PluginLogDialog({ plugin, open, onOpenChange }: PluginLogDialogProps) {
  const { lines, clear } = usePluginLog(plugin.id, open)

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`${plugin.name} log`}
      size="lg"
      actions={
        <>
          <Button variant="soft" icon={<Trash2 size={14} />} onClick={() => void clear()} disabled={lines.length === 0}>
            Clear
          </Button>
          <Button icon={<Copy size={14} />} onClick={() => void navigator.clipboard.writeText(asText(lines))} disabled={lines.length === 0}>
            Copy
          </Button>
        </>
      }
    >
      {lines.length === 0 ? (
        <p className="py-6 text-center text-ink-quiet">Nothing logged since Alpine Shell started.</p>
      ) : (
        <ol className="max-h-80 select-text overflow-y-auto rounded-field bg-surface-1 px-3 py-2.5 font-mono text-xs/5">
          {lines.map((line, index) => (
            <LogLine key={index} line={line} />
          ))}
        </ol>
      )}
    </Dialog>
  )
}

import { useEffect, useState, type ReactNode } from 'react'
import { RotateCcw } from 'lucide-react'
import { Button, Card, IconButton, PageTitle, Row, Section } from '@alpine/ui'
import { settingsEntry, settingsPage } from '../../settings/registry'
import { APP_SHORTCUTS, DESKTOP_SHORTCUTS, SEARCH_SHORTCUTS, WINDOW_SHORTCUTS, refusalMessage } from '../../settings/shortcutCatalogue'
import { useShortcutBindings } from '../../hooks/useShortcutBindings'
import { entryRowContent } from './registryRowContent'
import KeyCaps from './keyCaps'

const SEARCH_HOTKEY_SETTING = 'launcher-hotkey'

interface ShortcutRefusalNote {
  id: ShortcutBindingId
  message: string
}

export default function ShortcutsPage() {
  const bindings = useShortcutBindings()
  const [recording, setRecording] = useState<ShortcutBindingId | null>(null)
  const [refusal, setRefusal] = useState<ShortcutRefusalNote | null>(null)
  const searchHotkey = settingsEntry(SEARCH_HOTKEY_SETTING)

  useEffect(() => {
    if (recording === null) return
    const cancelOnBlur = () => window.shell.shortcuts.cancelRecord()
    window.addEventListener('blur', cancelOnBlur)
    return () => window.removeEventListener('blur', cancelOnBlur)
  }, [recording])

  useEffect(() => () => void window.shell.shortcuts.cancelRecord(), [])

  async function record(id: ShortcutBindingId) {
    setRefusal(null)
    setRecording(id)
    const result = await window.shell.shortcuts.record(id)
    setRecording((current) => (current === id ? null : current))
    const message = refusalMessage(result)
    if (message) setRefusal({ id, message })
  }

  function rowFor(listing: ShortcutListing) {
    const binding = listing.binding ? bindings.find((candidate) => candidate.id === listing.binding) : undefined
    if (!listing.binding) return <FixedShortcutRow key={listing.label} label={listing.label} keys={listing.keys ?? []} />
    return (
      <BindingRow
        key={listing.label}
        label={listing.label}
        binding={binding}
        recording={recording === listing.binding}
        refusal={refusal?.id === listing.binding ? refusal.message : null}
        onRecord={() => record(listing.binding as ShortcutBindingId)}
        onCancel={() => window.shell.shortcuts.cancelRecord()}
        onReset={() => window.shell.shortcuts.reset(listing.binding as ShortcutBindingId)}
      />
    )
  }

  function section(group: ShortcutGroup, lead?: ReactNode) {
    return (
      <Section variant="label" title={group.title}>
        <Card variant="group">
          {lead}
          {group.shortcuts.map(rowFor)}
        </Card>
      </Section>
    )
  }

  return (
    <div className="flex w-full flex-col gap-section">
      <PageTitle variant="plain" title={settingsPage('shortcuts')?.label ?? ''} />
      <div className="grid grid-cols-1 items-start gap-section lg:grid-cols-2">
        <div className="flex flex-col gap-section">
          {section(SEARCH_SHORTCUTS, searchHotkey && entryRowContent(searchHotkey, searchHotkey.description))}
          {section(APP_SHORTCUTS)}
        </div>
        <div className="flex flex-col gap-section">
          {section(WINDOW_SHORTCUTS)}
          {section(DESKTOP_SHORTCUTS)}
        </div>
      </div>
    </div>
  )
}

function BindingRow({
  label,
  binding,
  recording,
  refusal,
  onRecord,
  onCancel,
  onReset,
}: {
  label: string
  binding: ShortcutBinding | undefined
  recording: boolean
  refusal: string | null
  onRecord: () => void
  onCancel: () => void
  onReset: () => void
}) {
  return (
    <Row label={label} description={refusal ? <span className="text-danger">{refusal}</span> : undefined}>
      <div className="flex items-center gap-2">
        {recording ? (
          <span role="status" className="inline-flex h-[22px] items-center rounded-[5px] px-2 text-[11px] text-ink-primary ring-1 ring-ink-quiet">
            Press a shortcut
          </span>
        ) : (
          binding && <KeyCaps keys={binding.keys} />
        )}
        {binding?.custom && !recording && (
          <IconButton label={`Restore the default for ${label}`} tooltip="topEnd" onClick={onReset}>
            <RotateCcw size={14} />
          </IconButton>
        )}
        <Button shape="square" variant="ghost" size="sm" disabled={!binding} onClick={recording ? onCancel : onRecord}>
          {recording ? 'Cancel' : 'Set'}
        </Button>
      </div>
    </Row>
  )
}

function FixedShortcutRow({ label, keys }: { label: string; keys: string[] }) {
  return (
    <Row label={label}>
      <div className="flex items-center gap-2">
        <KeyCaps keys={keys} />
        <span aria-hidden className="invisible">
          <Button shape="square" variant="ghost" size="sm" tabIndex={-1}>
            Set
          </Button>
        </span>
      </div>
    </Row>
  )
}

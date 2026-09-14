import type { ReactNode } from 'react'
import { isSettingsValueEntry } from '../../settings/registry'
import { ActionRow, ValueRow } from './registryRow'

export function registryPageRendersEntry(entry: SettingsEntry): boolean {
  return entryRowContent(entry, '') !== null
}

export function entryRowContent(entry: SettingsEntry, description: string, wideControlStacked = false, info?: string): ReactNode {
  if (isSettingsValueEntry(entry)) return entry.applies === 'draft' ? null : <ValueRow entry={entry} description={description} info={info} wideControlStacked={wideControlStacked} />
  if (entry.control.kind === 'action') return <ActionRow entry={entry} description={description} info={info} run={entry.control.run} actionLabel={entry.control.actionLabel} actionIcon={entry.control.actionIcon} />
  return null
}

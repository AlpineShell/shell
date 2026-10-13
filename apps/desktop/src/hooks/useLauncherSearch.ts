import { useMemo } from 'react'
import { useLauncherEntries } from './useLauncherEntries'
import { useLauncherMemory } from './useLauncherMemory'
import { useLauncherMaxResults } from './useLauncherMaxResults'
import { useSemanticIndex } from './useSemanticIndex'
import { useRunCommand } from './useRunCommand'
import { searchLauncher } from '../lib/launcher/launcherQuery'

export function useLauncherSearch(query: string, enabled: boolean): LauncherSection[] {
  const entries = useLauncherEntries()
  const memory = useLauncherMemory()
  const maxResults = useLauncherMaxResults()
  const semantic = useSemanticIndex()
  const run = useRunCommand(enabled ? query : '')

  return useMemo(
    () => (enabled ? searchLauncher(entries, query, { memory, maxResults, semantic, run }) : []),
    [enabled, entries, query, memory, maxResults, semantic, run]
  )
}

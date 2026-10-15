import { useState } from 'react'
import { useShellState } from './useShellState'

const UNKNOWN_STATE: DateTimeState = { timeZoneId: null, timeZones: [], autoTimeZone: null, autoTime: null }

type DateTimeChange = 'time-zone' | 'auto-time-zone' | 'auto-time' | 'sync'

const FAILURE_MESSAGES: Record<DateTimeChange, string> = {
  'time-zone': 'Windows did not change the time zone.',
  'auto-time-zone': 'Windows did not change automatic time zone.',
  'auto-time': 'Windows did not change automatic time.',
  sync: 'Windows could not reach the time server.',
}

export function useDateTime() {
  const state = useShellState(UNKNOWN_STATE, window.shell.dateTime.state, window.shell.dateTime.onChanged)
  const [busy, setBusy] = useState<DateTimeChange | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [synced, setSynced] = useState(false)

  async function run(change: DateTimeChange, request: () => Promise<DateTimeChangeResult>) {
    setBusy(change)
    setFailure(null)
    setSynced(false)
    try {
      const result = await request()
      if (!result.ok && !result.declined) setFailure(FAILURE_MESSAGES[change])
      if (result.ok && change === 'sync') setSynced(true)
    } catch {
      setFailure(FAILURE_MESSAGES[change])
    } finally {
      setBusy(null)
    }
  }

  return {
    state,
    busy,
    failure,
    synced,
    setTimeZone: (id: string) => run('time-zone', () => window.shell.dateTime.setTimeZone(id)),
    setAutoTimeZone: (on: boolean) => run('auto-time-zone', () => window.shell.dateTime.setAutoTimeZone(on)),
    setAutoTime: (on: boolean) => run('auto-time', () => window.shell.dateTime.setAutoTime(on)),
    syncNow: () => run('sync', () => window.shell.dateTime.syncNow()),
  }
}

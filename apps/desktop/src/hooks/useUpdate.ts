import { useShellState } from './useShellState'

export function useUpdate() {
  const state = useShellState<UpdateState>(
    { status: 'idle', currentVersion: '', availableVersion: null, progressPercent: 0, error: null, signInRequired: false },
    window.shell.updates.getState,
    window.shell.updates.onStateChanged
  )

  const log = useShellState<UpdateLogEntry[]>(
    [],
    window.shell.updates.getLog,
    window.shell.updates.onLogChanged
  )

  const preferences = useShellState<UpdatePreferences | null>(
    null,
    window.shell.updates.preferences,
    window.shell.updates.onPreferencesChanged
  )

  return {
    state,
    log,
    preferences,
    setChannel: (channel: UpdateChannel) => window.shell.updates.setPreferences({ channel }),
    check: window.shell.updates.check,
    download: window.shell.updates.download,
    install: window.shell.updates.install,
    openChangelog: window.shell.updates.openChangelog,
  }
}

import { useShellState } from './useShellState'

export function useUpdate() {
  const state = useShellState<UpdateState>(
    { status: 'idle', currentVersion: '', availableVersion: null, progressPercent: 0, error: null },
    window.shell.updates.getState,
    window.shell.updates.onStateChanged
  )

  return {
    state,
    check: window.shell.updates.check,
    download: window.shell.updates.download,
    install: window.shell.updates.install,
  }
}

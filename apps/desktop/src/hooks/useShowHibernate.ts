import { useShellState } from './useShellState'

const SHOW_HIBERNATE_BY_DEFAULT = true

export function useShowHibernate() {
  return useShellState(
    SHOW_HIBERNATE_BY_DEFAULT,
    window.shell.system.showHibernate,
    window.shell.system.onShowHibernateChanged
  )
}

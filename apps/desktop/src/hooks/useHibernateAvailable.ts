import { useShellState } from './useShellState'

const subscribeToNothing = () => {}

export function useHibernateAvailable() {
  return useShellState(false, window.shell.system.hibernateAvailable, subscribeToNothing)
}

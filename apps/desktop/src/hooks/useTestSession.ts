import { useShellState } from './useShellState'

const fetchTestSession = () => window.setup.isTestSession()

export function useTestSession(): boolean | null {
  return useShellState<boolean | null>(null, fetchTestSession, () => {})
}

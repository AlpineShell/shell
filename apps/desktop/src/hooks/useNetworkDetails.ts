import { useShellState } from './useShellState'

const NOT_READ_YET = undefined

export function useNetworkDetails(): NetworkDetails | null | undefined {
  return useShellState<NetworkDetails | null | undefined>(
    NOT_READ_YET,
    window.shell.network.details,
    window.shell.network.onDetailsChanged
  )
}

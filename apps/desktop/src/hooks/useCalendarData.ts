import { useShellState } from './useShellState'

const EMPTY_DATA: CalendarData = { events: [], tasks: [], fetchedAt: null, error: null }

export function useCalendarData() {
  return useShellState<CalendarData>(
    EMPTY_DATA,
    () => window.shell?.calendar?.data?.() ?? Promise.resolve(EMPTY_DATA),
    (callback) => window.shell?.calendar?.onDataChanged?.(callback)
  )
}

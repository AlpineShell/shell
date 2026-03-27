import { useShellState } from "./useShellState"

export function useTopbarColor() {
    return useShellState<TopBarColor | null>(
        null,
        () => window.topbar.color(),
        (cb) => window.topbar.onColorChanged(cb)
    )
}

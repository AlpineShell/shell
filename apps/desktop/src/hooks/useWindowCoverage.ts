import { useShellState } from "./useShellState"

const MY_DISPLAY_ID = Number(new URLSearchParams(window.location.search).get("displayId"))
const NO_COVERAGE: TopbarRegionBounds[] = []

export function useWindowCoverage(): TopbarRegionBounds[] {
    const coverage = useShellState<DisplayWindowCoverage[]>(
        [],
        window.topbar.windowCoverage,
        window.topbar.onWindowCoverageChanged
    )
    return coverage.find((display) => display.displayId === MY_DISPLAY_ID)?.rects ?? NO_COVERAGE
}

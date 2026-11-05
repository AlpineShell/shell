import { useShellState } from "./useShellState"

const MY_DISPLAY_ID = Number(new URLSearchParams(window.location.search).get("displayId"))
const NO_COVERAGE: TopbarRegionBounds[] = []

function sameRect(a: TopbarRegionBounds, b: TopbarRegionBounds): boolean {
    return a.left === b.left && a.top === b.top && a.right === b.right && a.bottom === b.bottom
}

export function sameCoverage(a: TopbarRegionBounds[], b: TopbarRegionBounds[]): boolean {
    return a.length === b.length && a.every((rect, index) => sameRect(rect, b[index]))
}

let lastCoverage = NO_COVERAGE

function stableCoverage(rects: TopbarRegionBounds[]): TopbarRegionBounds[] {
    if (!sameCoverage(lastCoverage, rects)) lastCoverage = rects
    return lastCoverage
}

export function useWindowCoverage(): TopbarRegionBounds[] {
    const coverage = useShellState<DisplayWindowCoverage[]>(
        [],
        window.topbar.windowCoverage,
        window.topbar.onWindowCoverageChanged
    )
    const rects = coverage.find((display) => display.displayId === MY_DISPLAY_ID)?.rects ?? NO_COVERAGE
    return stableCoverage(rects)
}

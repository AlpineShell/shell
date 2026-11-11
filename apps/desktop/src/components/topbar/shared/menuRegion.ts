let armedMenuRegion: TopbarActiveRegion | null = null;

export function armMenuRegion(region: TopbarActiveRegion | null) {
    armedMenuRegion = region;
    window.topbar.setActiveRegion(region);
}

export function rearmMenuRegion() {
    window.topbar.setActiveRegion(armedMenuRegion);
}

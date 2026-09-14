import { useEffect, type RefObject } from "react";

const CLUSTER_ZONE_PAD_PX = 8;

function clusterZones(cluster: HTMLElement | null): TopbarInteractiveZone[] {
    if (!cluster) return [];
    const rect = cluster.getBoundingClientRect();
    if (rect.width <= 0) return [];
    return [{
        left: Math.floor(rect.left) - CLUSTER_ZONE_PAD_PX,
        right: Math.ceil(rect.right) + CLUSTER_ZONE_PAD_PX,
    }];
}

function sameZones(previous: TopbarInteractiveZone[] | null, next: TopbarInteractiveZone[]) {
    return previous !== null
        && previous.length === next.length
        && previous.every((zone, index) => zone.left === next[index].left && zone.right === next[index].right);
}

export function useTopbarInteractiveZones(
    left: RefObject<HTMLElement | null>,
    center: RefObject<HTMLElement | null>,
    right: RefObject<HTMLElement | null>,
) {
    useEffect(() => {
        const clusters = [left.current, center.current, right.current];
        let reported: TopbarInteractiveZone[] | null = null;
        let pendingFrame: number | null = null;

        const report = () => {
            pendingFrame = null;
            const zones = clusters.flatMap(clusterZones);
            if (sameZones(reported, zones)) return;
            reported = zones;
            window.topbar.setInteractiveZones(zones);
        };

        const scheduleReport = () => {
            if (pendingFrame === null) pendingFrame = requestAnimationFrame(report);
        };

        const observer = new ResizeObserver(scheduleReport);
        for (const cluster of clusters) {
            if (cluster) observer.observe(cluster);
        }
        window.addEventListener("resize", scheduleReport);
        scheduleReport();

        return () => {
            observer.disconnect();
            window.removeEventListener("resize", scheduleReport);
            if (pendingFrame !== null) cancelAnimationFrame(pendingFrame);
        };
    }, [left, center, right]);
}

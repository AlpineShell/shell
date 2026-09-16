export const SHOULDER = 14;
export const RADIUS = 14;

export type ChromeAnchor = "center" | "left" | "right";

export interface ChromeSurfaceGeometry {
    centerX: number;
    bodyWidth: number;
    height: number;
    barBottom: number;
    anchor: ChromeAnchor;
}

export interface ChromeGeometry extends ChromeSurfaceGeometry {
    screenWidth: number;
}

interface ResolvedShape {
    shoulder: number;
    radius: number;
    bodyLeft: number;
    bodyRight: number;
    leftTip: number;
    rightTip: number;
    leftShoulder: boolean;
    rightShoulder: boolean;
    top: number;
    bottom: number;
}

function resolve(g: ChromeSurfaceGeometry): ResolvedShape {
    const halfBody = g.bodyWidth / 2;
    const radius = Math.min(RADIUS, halfBody, g.height / 2);
    const shoulder = Math.min(SHOULDER, Math.max(0, g.height - radius));
    const bodyLeft = g.centerX - halfBody;
    const bodyRight = g.centerX + halfBody;
    const leftShoulder = g.anchor !== "left";
    const rightShoulder = g.anchor !== "right";
    return {
        shoulder,
        radius,
        bodyLeft,
        bodyRight,
        leftShoulder,
        rightShoulder,
        leftTip: leftShoulder ? bodyLeft - shoulder : bodyLeft,
        rightTip: rightShoulder ? bodyRight + shoulder : bodyRight,
        top: g.barBottom,
        bottom: g.barBottom + g.height,
    };
}

export function chromeSurfaceBounds(g: ChromeSurfaceGeometry): TopbarRegionBounds {
    const s = resolve(g);
    return { top: s.top, bottom: s.bottom, left: s.leftTip, right: s.rightTip };
}

export function chromeContentBounds(g: ChromeSurfaceGeometry): TopbarRegionBounds {
    const s = resolve(g);
    return { top: s.top, bottom: s.bottom, left: s.bodyLeft, right: s.bodyRight };
}

export function surfaceFillPath(g: ChromeGeometry): string {
    const s = resolve(g);
    let d = `M${s.leftTip} ${s.top} L${s.rightTip} ${s.top}`;
    if (s.rightShoulder) d += ` A${s.shoulder} ${s.shoulder} 0 0 0 ${s.bodyRight} ${s.top + s.shoulder}`;
    d += ` L${s.bodyRight} ${s.bottom - s.radius} A${s.radius} ${s.radius} 0 0 1 ${s.bodyRight - s.radius} ${s.bottom}`;
    d += ` L${s.bodyLeft + s.radius} ${s.bottom} A${s.radius} ${s.radius} 0 0 1 ${s.bodyLeft} ${s.bottom - s.radius}`;
    if (s.leftShoulder) d += ` L${s.bodyLeft} ${s.top + s.shoulder} A${s.shoulder} ${s.shoulder} 0 0 0 ${s.leftTip} ${s.top}`;
    else d += ` L${s.bodyLeft} ${s.top}`;
    return d + " Z";
}

export function barBorderPath(g: ChromeGeometry, hasSurface: boolean): string {
    const top = g.barBottom;
    if (!hasSurface) {
        return `M0 ${top} L${g.screenWidth} ${top}`;
    }
    const s = resolve(g);
    let d = `M0 ${top} L${s.leftTip} ${top}`;
    if (s.leftShoulder) d += ` A${s.shoulder} ${s.shoulder} 0 0 1 ${s.bodyLeft} ${top + s.shoulder}`;
    d += ` L${s.bodyLeft} ${s.bottom - s.radius} A${s.radius} ${s.radius} 0 0 0 ${s.bodyLeft + s.radius} ${s.bottom}`;
    d += ` L${s.bodyRight - s.radius} ${s.bottom} A${s.radius} ${s.radius} 0 0 0 ${s.bodyRight} ${s.bottom - s.radius}`;
    d += ` L${s.bodyRight} ${top + (s.rightShoulder ? s.shoulder : 0)}`;
    if (s.rightShoulder) d += ` A${s.shoulder} ${s.shoulder} 0 0 1 ${s.rightTip} ${top}`;
    return d + ` L${g.screenWidth} ${top}`;
}

export function windowCoverageClipPath(rects: TopbarRegionBounds[]): string {
    return rects.map((r) => `M${r.left} ${r.top} H${r.right} V${r.bottom} H${r.left} Z`).join(" ");
}

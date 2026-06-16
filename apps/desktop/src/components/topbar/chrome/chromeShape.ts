export const SHOULDER = 14;
export const RADIUS = 14;

export interface ChromeGeometry {
    centerX: number;
    bodyWidth: number;
    height: number;
    barBottom: number;
    screenWidth: number;
}

interface ResolvedShape {
    shoulder: number;
    radius: number;
    bodyLeft: number;
    bodyRight: number;
    leftTip: number;
    rightTip: number;
    top: number;
    bottom: number;
}

function resolve(g: ChromeGeometry): ResolvedShape {
    const halfBody = g.bodyWidth / 2;
    const radius = Math.min(RADIUS, halfBody, g.height / 2);
    const shoulder = Math.min(SHOULDER, Math.max(0, g.height - radius));
    const bodyLeft = g.centerX - halfBody;
    const bodyRight = g.centerX + halfBody;
    return {
        shoulder,
        radius,
        bodyLeft,
        bodyRight,
        leftTip: bodyLeft - shoulder,
        rightTip: bodyRight + shoulder,
        top: g.barBottom,
        bottom: g.barBottom + g.height,
    };
}

export function surfaceFillPath(g: ChromeGeometry): string {
    const s = resolve(g);
    return (
        `M${s.leftTip} ${s.top} L${s.rightTip} ${s.top}` +
        ` A${s.shoulder} ${s.shoulder} 0 0 0 ${s.bodyRight} ${s.top + s.shoulder}` +
        ` L${s.bodyRight} ${s.bottom - s.radius}` +
        ` A${s.radius} ${s.radius} 0 0 1 ${s.bodyRight - s.radius} ${s.bottom}` +
        ` L${s.bodyLeft + s.radius} ${s.bottom}` +
        ` A${s.radius} ${s.radius} 0 0 1 ${s.bodyLeft} ${s.bottom - s.radius}` +
        ` L${s.bodyLeft} ${s.top + s.shoulder}` +
        ` A${s.shoulder} ${s.shoulder} 0 0 0 ${s.leftTip} ${s.top} Z`
    );
}

export function barBorderPath(g: ChromeGeometry, hasSurface: boolean, surfaceOutline: boolean): string {
    const top = g.barBottom;
    if (!hasSurface) {
        return `M0 ${top} L${g.screenWidth} ${top}`;
    }
    const s = resolve(g);
    if (!surfaceOutline) {
        return `M0 ${top} L${s.leftTip} ${top} M${s.rightTip} ${top} L${g.screenWidth} ${top}`;
    }
    return (
        `M0 ${top} L${s.leftTip} ${top}` +
        ` A${s.shoulder} ${s.shoulder} 0 0 1 ${s.bodyLeft} ${top + s.shoulder}` +
        ` L${s.bodyLeft} ${s.bottom - s.radius}` +
        ` A${s.radius} ${s.radius} 0 0 0 ${s.bodyLeft + s.radius} ${s.bottom}` +
        ` L${s.bodyRight - s.radius} ${s.bottom}` +
        ` A${s.radius} ${s.radius} 0 0 0 ${s.bodyRight} ${s.bottom - s.radius}` +
        ` L${s.bodyRight} ${top + s.shoulder}` +
        ` A${s.shoulder} ${s.shoulder} 0 0 1 ${s.rightTip} ${top}` +
        ` L${g.screenWidth} ${top}`
    );
}

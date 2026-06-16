export const SHOULDER = 14;
export const RADIUS = 14;

function sidesSequence(width: number, height: number) {
    const c = SHOULDER;
    const r = RADIUS;
    return `A${c} ${c} 0 0 0 ${width - c} ${c} L${width - c} ${height - r} A${r} ${r} 0 0 1 ${width - c - r} ${height} L${c + r} ${height} A${r} ${r} 0 0 1 ${c} ${height - r} L${c} ${c} A${c} ${c} 0 0 0 0 0`;
}

export function fillPath(width: number, height: number) {
    return `M0 0 L${width} 0 ${sidesSequence(width, height)} Z`;
}

export function borderPath(width: number, height: number) {
    return `M${width} 0 ${sidesSequence(width, height)}`;
}

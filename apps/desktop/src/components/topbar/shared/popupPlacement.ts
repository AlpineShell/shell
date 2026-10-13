import { SHOULDER, type ChromeAnchor } from "../chrome/chromeShape";

const SCREEN_PAD = 6;
const EDGE_PAD = 0;

export interface PopupPlacement {
    left: number;
    centerX: number;
    anchor: ChromeAnchor;
}

export function placePopup(triggerCenter: number, bodyWidth: number, screenWidth: number): PopupPlacement {
    const half = bodyWidth / 2;
    let anchor: ChromeAnchor = "center";
    let left = Math.round(triggerCenter - half);
    if (triggerCenter - half - SHOULDER < SCREEN_PAD) {
        anchor = "left";
        left = EDGE_PAD;
    } else if (triggerCenter + half + SHOULDER > screenWidth - SCREEN_PAD) {
        anchor = "right";
        left = screenWidth - EDGE_PAD - bodyWidth;
    }
    return { left, centerX: left + half, anchor };
}

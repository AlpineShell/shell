const SHARP_UPSCALE = 1.25;
const BLUR_PER_UPSCALE = 3;
export const MAX_COVER_BLUR = 12;

type Size = { width: number; height: number };

export function coverBlurPx(natural: Size | null, displayed: Size, devicePixelRatio: number) {
    if (!natural || natural.width <= 0 || natural.height <= 0) return 0;
    const upscale = Math.max(displayed.width / natural.width, displayed.height / natural.height) * devicePixelRatio;
    if (upscale <= SHARP_UPSCALE) return 0;
    return Math.min(MAX_COVER_BLUR, Math.round((upscale - 1) * BLUR_PER_UPSCALE));
}

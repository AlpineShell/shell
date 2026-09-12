const FALLBACK_BAR_BACKGROUND = "rgb(31,32,32)";

export function topbarSurface(color: TopBarColor | null): TopbarSurface {
    const darkText = color?.darkText ?? false;
    return {
        bg: color ? `rgb(${color.r},${color.g},${color.b})` : FALLBACK_BAR_BACKGROUND,
        darkText,
        borderColor: darkText ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.12)",
    };
}

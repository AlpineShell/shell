import { useMemo } from "react";
import Clock from "./clock";
import StatusIndicator from "./status/statusIndicator";
import SystemMenu from "./systemMenu";
import { ThemeProvider } from "../themeContext";
import MediaStatus from "./status/mediaStatus";
import MicrophoneStatus from "./status/microphoneStatus";
import { useTopbarColor } from "../../hooks/useTopbarColor";

function luminance(r: number, g: number, b: number) {
    return 0.299 * r + 0.587 * g + 0.114 * b;
}

function blend(c: number, target: number, amount: number) {
    return Math.round(c + (target - c) * amount);
}

function deriveBackground(color: TopBarColor | null) {
    if (!color) return { bg: "rgb(31,32,32)", darkText: false };
    const lum = luminance(color.r, color.g, color.b);
    if (lum > 140) {
        const r = blend(color.r, 220, 0.65);
        const g = blend(color.g, 220, 0.65);
        const b = blend(color.b, 220, 0.65);
        return { bg: `rgb(${r},${g},${b})`, darkText: true };
    }
    const r = blend(color.r, 38, 0.65);
    const g = blend(color.g, 38, 0.65);
    const b = blend(color.b, 38, 0.65);
    return { bg: `rgb(${r},${g},${b})`, darkText: false };
}

export default function TopBar() {
    const color = useTopbarColor();
    const { bg, darkText } = useMemo(() => deriveBackground(color), [color]);

    return (
        <ThemeProvider value={{ darkText, bg }}>
            <div
                className="w-full flex justify-between items-center h-6 relative z-10 transition-colors duration-300"
                style={{ backgroundColor: bg }}
            >
                <div className="flex items-center gap-1">
                    <SystemMenu />
                </div>
                <div className="flex items-center gap-1 mr-1">
                    <MicrophoneStatus />
                    <MediaStatus />
                    <StatusIndicator />
                    <Clock />
                </div>
            </div>
        </ThemeProvider>
    );
}

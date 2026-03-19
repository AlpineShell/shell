import { useEffect, useMemo, useState } from "react";
import Clock from "./clock";
import StatusIndicator from "./statusIndicator";
import SystemMenu from "./systemMenu";
import { ThemeProvider } from "./themeContext";
import MediaStatus from "./mediaStatus";
import MicrophoneStatus from "./microphoneStatus";

function parseRgb(rgba: string): [number, number, number] {
    const match = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!match) return [63, 63, 63];
    return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function isLightColor(r: number, g: number, b: number): boolean {
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5;
}

export default function TopBar() {
    const [bgColor, setBgColor] = useState("rgba(63, 63, 63, 1)");

    useEffect(() => {
        window.topbar.color().then((color) => {
            if (color) setBgColor(`rgba(${color.r}, ${color.g}, ${color.b}, 1)`);
        });
        window.topbar.onColorChanged((color) => {
            setBgColor(`rgba(${color.r}, ${color.g}, ${color.b}, 1)`);
        });
    }, []);

    const darkText = useMemo(() => {
        const [r, g, b] = parseRgb(bgColor);
        return isLightColor(r, g, b);
    }, [bgColor]);

    return (
        <ThemeProvider value={darkText}>
            <div
                className="w-full flex justify-between items-center h-6 transition-colors duration-300"
                style={{ backgroundColor: bgColor }}
            >
                <div className="flex items-center gap-1">
                    <SystemMenu />
                </div>
                <div className="flex items-center gap-1 mr-1">
                    <MediaStatus />
                    <MicrophoneStatus />
                    <StatusIndicator />
                    <Clock />
                </div>
            </div>
        </ThemeProvider>
    );
}
